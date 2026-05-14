const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const privateKeyLine = envContent.split("\n").find(l => l.startsWith("FIREBASE_PRIVATE_KEY="));
let privateKey = privateKeyLine ? privateKeyLine.split("=")[1] : "";
console.log("Original length:", privateKey.length);
console.log("Starts with quote?", privateKey.startsWith('"'));

privateKey = privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n").trim();
console.log("Processed length:", privateKey.length);
console.log("First 30 chars:", privateKey.substring(0, 30));
console.log("Last 30 chars:", privateKey.substring(privateKey.length - 30));

try {
  const auth = new google.auth.JWT({
    email: process.env.FIREBASE_CLIENT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  console.log("JWT created successfully");
  
  // Try to sign something or get a token to see if the key is actually valid for OpenSSL
  auth.authorize((err, tokens) => {
    if (err) {
      console.error("Authorize error:", err.message);
      if (err.stack) console.error(err.stack);
    } else {
      console.log("Authorize success");
    }
  });
} catch (e) {
  console.error("JWT creation failed:", e.message);
  console.error(e.stack);
}
