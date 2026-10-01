// Serve the application shell for routes; missing assets retain their S3 error.
function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('/assets/') !== 0 &&
      (request.uri.indexOf('/monitors/') === 0 ||
       request.uri.indexOf('/public/') === 0 ||
       request.uri === '/auth/callback' ||
       request.uri.split('/').pop().indexOf('.') === -1)) {
    request.uri = '/index.html';
  }
  return request;
}
