import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "@/lib/firebase/admin";
import { generateStoreAuthorizationPDF } from "@/lib/pdf/storeAuthorizationPdf";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the request document
    const docSnapshot = await adminDb
      .collection("storeAuthorizationRequests")
      .doc(id)
      .get();

    if (!docSnapshot.exists) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      );
    }

    const requestData = docSnapshot.data();
    if (!requestData) {
      return NextResponse.json(
        { error: "Request data is empty" },
        { status: 400 }
      );
    }

    if (requestData.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved requests can generate PDF" },
        { status: 400 }
      );
    }

    // Generate PDF
    const pdfBuffer = await generateStoreAuthorizationPDF(requestData, id);

    if (!bucket) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    // Upload to Firebase Storage
    const fileName = `store-authorization-${requestData.requestNumber}-${Date.now()}.pdf`;
    const file = bucket.file(`store-authorizations/${fileName}`);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
      },
    });

    // Make file public and get URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/store-authorizations/${fileName}`;

    // Update document with PDF URL
    await adminDb
      .collection("storeAuthorizationRequests")
      .doc(id)
      .update({
        pdfUrl: publicUrl,
      });

    return NextResponse.json({
      success: true,
      pdfUrl: publicUrl,
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
