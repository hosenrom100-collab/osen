import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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

    try {
      // Run AppleScript directly using osascript inline parameters
      await execFileAsync("osascript", [
        "-e", 'tell application "Microsoft Word"',
        "-e", "set display alerts to alert none",
        "-e", `open "${tempDocxPath}"`,
        "-e", `save as active document file name "${tempPdfPath}" file format format PDF`,
        "-e", "close active document saving no",
        "-e", "end tell"
      ]);
    } catch (cmdErr: any) {
      console.error("AppleScript conversion failed:", cmdErr);
      if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
      return NextResponse.json({ error: "Failed to convert document: " + cmdErr.message }, { status: 500 });
    }

    // Clean up docx
    if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);

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
