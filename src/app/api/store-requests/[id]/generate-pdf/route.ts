import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { bucket } from "@/lib/firebase/admin";
import { generateStoreAuthorizationPDF } from "@/lib/pdf/storeAuthorizationPdf";

// Helper to fetch Merav's signature image from Firestore
async function fetchMeravSignature(): Promise<string> {
  let meravSignatureImage = "";
  try {
    const snap = await adminDb
      .collection("users")
      .where("displayName", "==", "מירב סארמילי")
      .get();
    
    snap.forEach((d) => {
      const uData = d.data();
      if (uData.signatureImage) {
        meravSignatureImage = uData.signatureImage;
      }
    });
  } catch (err) {
    console.error("Error fetching Merav signature:", err);
  }
  return meravSignatureImage;
}

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

    // Fetch Merav's signature from user document
    const meravSignatureImage = await fetchMeravSignature();

    // 2. Generate fresh PDF Buffer
    const pdfBuffer = await generateStoreAuthorizationPDF(requestData, id, { meravSignatureImage });

    let finalPdfUrl = "";

    // 3. Try uploading to Firebase Storage bucket if configured
    if (bucket) {
      try {
        const fileName = `store-authorization-${requestData.requestNumber || id}.pdf`;
        const file = bucket.file(`store-authorizations/${fileName}`);

        await file.save(pdfBuffer, {
          metadata: {
            contentType: "application/pdf",
            cacheControl: "private, no-cache, no-store, must-revalidate",
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
        console.error("Storage upload failed, falling back to dynamic route:", uploadErr);
      }
    }

    // 4. Fallback if storage fails or is unconfigured: Use dynamic download endpoint URL
    if (!finalPdfUrl) {
      finalPdfUrl = `/api/store-requests/${id}/generate-pdf`;
    }

    // 5. Save the PDF URL to Firestore
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const docSnapshot = await adminDb
      .collection("storeAuthorizationRequests")
      .doc(id)
      .get();

    if (!docSnapshot.exists) {
      return new Response("Request not found", { status: 404 });
    }

    const requestData = docSnapshot.data();
    if (!requestData || requestData.status !== "approved") {
      return new Response("Unauthorized or pending request", { status: 400 });
    }

    // Fetch Merav's signature from user document
    const meravSignatureImage = await fetchMeravSignature();

    // Generate PDF buffer on the fly
    const pdfBuffer = await generateStoreAuthorizationPDF(requestData, id, { meravSignatureImage });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="store-authorization-${requestData.requestNumber || id}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error serving PDF dynamically:", error);
    return new Response("Failed to serve PDF dynamically", { status: 500 });
  }
}
