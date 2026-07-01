import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // "header" | "footer"

    if (!file || !type) {
      return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Use the exact filename based on type
    const filename = type === "header" ? "logoup.png" : "logodown.png";
    
    const publicDir = path.join(process.cwd(), "public");
    const filePath = path.join(publicDir, filename);

    // Write file to public/
    await fs.promises.writeFile(filePath, buffer);

    // Return the absolute relative path with a cache-buster query parameter to force refresh in the client
    const fileUrl = `/${filename}?t=${Date.now()}`;
    return NextResponse.json({ url: fileUrl });
  } catch (error: any) {
    console.error("Error saving uploaded logo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
