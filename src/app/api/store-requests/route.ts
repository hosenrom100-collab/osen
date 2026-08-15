import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  try {
    const storeRequests = await adminDb
      .collection("storeAuthorizationRequests")
      .orderBy("createdAt", "desc")
      .get();

    const data = storeRequests.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching store requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get next request number
    const lastRequest = await adminDb
      .collection("storeAuthorizationRequests")
      .orderBy("requestNumber", "desc")
      .limit(1)
      .get();

    const nextNumber = lastRequest.empty
      ? 1001
      : lastRequest.docs[0].data().requestNumber + 1;

    const docRef = await adminDb
      .collection("storeAuthorizationRequests")
      .add({
        ...body,
        requestNumber: nextNumber,
        status: "pending",
        createdAt: new Date(),
      });

    return NextResponse.json({
      id: docRef.id,
      requestNumber: nextNumber,
    });
  } catch (error) {
    console.error("Error creating store request:", error);
    return NextResponse.json(
      { error: "Failed to create request" },
      { status: 500 }
    );
  }
}
