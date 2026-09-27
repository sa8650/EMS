/* Public Connect App endpoint: https://<ems>/connect */
import { handleConnect } from './_lib/connect_app.js';
import { failResponse } from './_lib/connect_protocol.js';

export async function onRequest(context) {
  try {
    return await handleConnect(context.request, context.env);
  } catch (error) {
    console.error('EMS connect', error);
    return failResponse('Connect App could not complete that request.', 500, 'internal');
  }
}
