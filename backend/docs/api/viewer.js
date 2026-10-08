const output = document.querySelector('#routes'), status = document.querySelector('#status'), search = document.querySelector('#search');
const element = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
fetch('/api/docs/openapi.json').then(response => { if (!response.ok) throw new Error('Contract unavailable'); return response.json(); }).then(doc => {
  status.textContent = `${Object.keys(doc.paths).length} documented paths · OpenAPI ${doc.openapi}`;
  for (const [path, methods] of Object.entries(doc.paths)) for (const [method, operation] of Object.entries(methods)) {
    const details = document.createElement('details');
    details.dataset.search = `${method} ${path} ${operation.description}`.toLowerCase();
    details.append(element('summary', `${method.toUpperCase()} ${path}`), element('p', operation.description));
    details.append(element('h2', 'Authentication and access'), element('pre', JSON.stringify({ security: operation.security, access: operation['x-access'] || [] }, null, 2)));
    details.append(element('h2', 'Parameters'), element('pre', JSON.stringify(operation.parameters || [], null, 2)));
    if (operation.requestBody) {
      const schema = Object.values(operation.requestBody.content)[0].schema;
      details.append(element('h2', 'Request'), element('pre', JSON.stringify(schema.$ref ? doc.components.schemas[schema.$ref.split('/').at(-1)] : schema, null, 2)));
    }
    details.append(element('h2', 'Responses'), element('pre', JSON.stringify(operation.responses, null, 2)));
    output.append(details);
  }
  search.addEventListener('input', () => { for (const item of output.children) item.hidden = !item.dataset.search.includes(search.value.toLowerCase()); });
}).catch(() => { status.textContent = 'Could not load the API contract. Reload to retry.'; });
