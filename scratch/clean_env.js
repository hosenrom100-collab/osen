const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const content = fs.readFileSync(envPath, 'utf8');

const lines = content.split('\n');
const newLines = lines.map(line => {
  if (line.startsWith('FIREBASE_PRIVATE_KEY=')) {
    let value = line.split('=')[1].trim();
    // Remove outer quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // Ensure all \n are converted to real newlines
    value = value.replace(/\\n/g, '\n');
    // Re-wrap in quotes and use \n for safety in .env
    const escapedValue = value.replace(/\n/g, '\\n');
    return `FIREBASE_PRIVATE_KEY="${escapedValue}"`;
  }
  return line;
});

fs.writeFileSync(envPath, newLines.join('\n'));
console.log('Cleaned .env.local');
