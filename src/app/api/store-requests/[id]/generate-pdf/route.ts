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

    // 1. Enforce Approval Status: PDF can ONLY be generated for approved requests
    if (requestData.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved requests can generate PDF" },
        { status: 400 }
      );
    }

    // 2. ONE-TIME GENERATION ENFORCEMENT:
    // If a PDF URL has already been generated for this request, reuse the existing single document!
    if (requestData.pdfUrl) {
      return NextResponse.json({
        success: true,
        pdfUrl: requestData.pdfUrl,
        reused: true,
      });
    }

    // 3. Generate PDF Buffer
    const pdfBuffer = await generateStoreAuthorizationPDF(requestData, id);

    let finalPdfUrl = "";

    // 4. Try uploading to Firebase Storage bucket if configured
    if (bucket) {
      try {
        const fileName = `store-authorization-${requestData.requestNumber || id}.pdf`;
        const file = bucket.file(`store-authorizations/${fileName}`);

        await file.save(pdfBuffer, {
          metadata: {
            contentType: "application/pdf",
          },
        });

        try {
          await file.makePublic();
          finalPdfUrl = `https://storage.googleapis.com/${bucket.name}/store-authorizations/${fileName}`;
        } catch (pubErr) {
          const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: "03-09-2099",
          });
          finalPdfUrl = signedUrl;
        }
      } catch (uploadErr) {
        console.error("Storage upload failed, falling back to base64 Data URL:", uploadErr);
      }
    }

    // 5. Fallback if storage fails or is unconfigured: Data URL encoding
    if (!finalPdfUrl) {
      finalPdfUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
    }

    // 6. Lock and Save the single, immutable PDF URL to Firestore
    await adminDb
      .collection("storeAuthorizationRequests")
      .doc(id)
      .update({
        pdfUrl: finalPdfUrl,
        pdfGeneratedAt: new Date(),
      });

    return NextResponse.json({
      success: true,
      pdfUrl: finalPdfUrl,
      reused: false,
    });
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
