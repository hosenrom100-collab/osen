"use client";

import { User } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/config";

export function useReceiptUpload(
  user: User | null,
  showToast: (message: string, type: "success" | "warning") => void
) {
  const handleSaveReceipt = async (file: File, notes: string) => {
    const fileId = `${Date.now()}_${user?.uid}`;
    const storageRef = ref(storage, `receipts/${fileId}.jpg`);
    await uploadBytes(storageRef, file, { contentType: "image/jpeg" });
    const imageUrl = await getDownloadURL(storageRef);

    await addDoc(collection(db, "receipts"), {
      userId: user?.uid || "",
      userName: user?.displayName || user?.email || "מערכת",
      notes: notes.trim(),
      imageUrl,
      createdAt: new Date(),
    });

    showToast("החשבונית נשמרה בהצלחה בארכיון הקבלות!", "success");
  };

  return { handleSaveReceipt };
}
