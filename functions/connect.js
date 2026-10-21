/* Retired legacy Connect App relay endpoint. SMS delivery now uses the
   authenticated /api/connectx/device/* endpoints directly between EMS and
   ConnectX Android. Keep this tombstone so old installations fail safely. */
export async function onRequest() {
  return new Response(JSON.stringify({
    ok: false,
    error: 'The legacy Connect App relay is retired. ConnectX Android now communicates directly with EMS over /api/connectx/device/*.'
  }), {
    status: 410,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
