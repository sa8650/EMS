// Shop-access tokens intentionally keep role='staff' for route compatibility.
// Their adminAccess claim is the authenticated administrator identity.
export function auditActorType(session){
  return session?.adminAccess || session?.role === 'admin' ? 'admin' : (session?.role || 'staff');
}

// Correct display of older audit entries written before adminAccess was honored.
// Only reclassify a legacy staff entry when its ID is the owner of THIS store
// and it does not identify an actual staff account.
export function isAdministratorAuditEntry(entry, storeAdmin, staffMap = {}){
  return entry?.actor_type === 'admin' ||
    (entry?.actor_type === 'staff' && !!storeAdmin?.id &&
      entry.actor_id === storeAdmin.id && !staffMap[entry.actor_id]);
}
