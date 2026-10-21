/* Self-contained CSV and genuine OOXML .xlsx export; no CDN, fake records or external dependencies. */
const text=value=>String(value??'');
const safe=value=>/^[=+@\-\t\r]/.test(text(value))&&typeof value==='string'?"'"+value:value;
const xml=value=>text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const csvCell=value=>{const v=text(safe(value));return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
export function reportCsv(headers,rows){return '\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n'}
const enc=new TextEncoder();
const u16=(a,n)=>a.push(n&255,(n>>>8)&255);
const u32=(a,n)=>a.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);
const crc=data=>{let c=-1;for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xEDB88320:0)}return (c^-1)>>>0};
function zip(files){const local=[],central=[];let offset=0;
 for(const [name,body] of files){const n=enc.encode(name),data=enc.encode(body),check=crc(data),head=[];
  u32(head,0x04034b50);u16(head,20);u16(head,0);u16(head,0);u16(head,0);u16(head,0);u32(head,check);u32(head,data.length);u32(head,data.length);u16(head,n.length);u16(head,0);
  local.push(Uint8Array.from([...head,...n,...data]));
  const dir=[];u32(dir,0x02014b50);u16(dir,20);u16(dir,20);u16(dir,0);u16(dir,0);u16(dir,0);u16(dir,0);u32(dir,check);u32(dir,data.length);u32(dir,data.length);u16(dir,n.length);u16(dir,0);u16(dir,0);u16(dir,0);u16(dir,0);u32(dir,0);u32(dir,offset);central.push(Uint8Array.from([...dir,...n]));offset+=head.length+n.length+data.length;
 }
 const end=[];u32(end,0x06054b50);u16(end,0);u16(end,0);u16(end,central.length);u16(end,central.length);u32(end,central.reduce((v,x)=>v+x.length,0));u32(end,offset);u16(end,0);
 return new Blob([...local,...central,Uint8Array.from(end)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function reportXlsx(headers,rows){const matrix=[headers,...rows];const cells=matrix.map((row,r)=>`<row r="${r+1}">${row.map((val,c)=>{let n=c+1,col='';while(n){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26)}const pos=col+(r+1);
 return typeof val==='number'&&Number.isFinite(val)?`<c r="${pos}"><v>${val}</v></c>`:`<c r="${pos}" t="inlineStr"><is><t xml:space="preserve">${xml(safe(val))}</t></is></c>`}).join('')}</row>`).join('');
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`;
 return zip([
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pharmacy Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml',sheet],
 ]);
}
export function downloadReport(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
