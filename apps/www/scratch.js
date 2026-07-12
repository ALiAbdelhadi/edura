const fs = require('fs');

const data = JSON.parse(fs.readFileSync('EduPlatform_Postman_Collection.json', 'utf8'));

let markdown = '# API Endpoints Summary\n\n';

function traverse(item, path) {
  if (item.item) {
    // It's a folder
    markdown += `## ${path}${item.name}\n\n`;
    item.item.forEach(child => traverse(child, path + item.name + ' / '));
  } else if (item.request) {
    // It's a request
    markdown += `### ${item.name}\n`;
    markdown += `**Method:** ${item.request.method}\n`;
    const url = typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '';
    markdown += `**URL:** ${url}\n`;
    
    if (item.request.body && item.request.body.mode === 'raw') {
      markdown += `**Body:**\n\`\`\`json\n${item.request.body.raw}\n\`\`\`\n`;
    }
    
    if (item.response && item.response.length > 0) {
      markdown += `**Mock Response (${item.response[0].code}):**\n\`\`\`json\n${item.response[0].body}\n\`\`\`\n`;
    }
    
    markdown += '\n---\n\n';
  }
}

data.item.forEach(item => traverse(item, ''));

fs.writeFileSync('api-summary.md', markdown);
console.log('Done generating summary.');
