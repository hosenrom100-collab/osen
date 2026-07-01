import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to temp folder in workspace
    const tempDir = path.join(process.cwd(), "public", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempDocxPath = path.join(tempDir, `${fileId}.docx`);
    const tempPdfPath = path.join(tempDir, `${fileId}.pdf`);

    fs.writeFileSync(tempDocxPath, buffer);

    // Run AppleScript to convert DOCX to PDF using Microsoft Word
    const appleScript = `
tell application "Microsoft Word"
  set display alerts to alert none
  open "${tempDocxPath}"
  set theActiveDoc to active document
  save as theActiveDoc file format format PDF file name "${tempPdfPath}"
  close theActiveDoc saving no
end tell
    `;

    const scriptPath = path.join(tempDir, `${fileId}.scpt`);
    fs.writeFileSync(scriptPath, appleScript);

    try {
      await execAsync(`osascript "${scriptPath}"`);
    } catch (cmdErr: any) {
      console.error("AppleScript conversion failed:", cmdErr);
      // Clean up docx and script
      if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      return NextResponse.json({ error: "Failed to convert document: " + cmdErr.message }, { status: 500 });
    }

    // Clean up docx and script
    if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
    if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

    if (!fs.existsSync(tempPdfPath)) {
      return NextResponse.json({ error: "PDF was not created" }, { status: 500 });
    }

    // Read the PDF
    const pdfBuffer = fs.readFileSync(tempPdfPath);
    
    // Clean up PDF
    fs.unlinkSync(tempPdfPath);

    // Send PDF back to client
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.name.replace(/\.docx$/, ".pdf")}"`,
      },
    });

  } catch (error: any) {
    console.error("PDF Conversion endpoint error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
