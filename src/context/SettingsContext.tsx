"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";
type FontSize = "small" | "medium" | "large";

interface SettingsContextType {
  theme: Theme;
  fontSize: FontSize;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: FontSize) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [fontSize, setFontSize] = useState<FontSize>("medium");

  // Load from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("hosen-theme") as Theme;
    const savedFontSize = localStorage.getItem("hosen-font-size") as FontSize;
    if (savedTheme) setTheme(savedTheme);
    if (savedFontSize) setFontSize(savedFontSize);
  }, []);

  // Apply to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("hosen-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.style.fontSize = 
      fontSize === "small" ? "14px" : 
      fontSize === "large" ? "18px" : 
      "16px";
    localStorage.setItem("hosen-font-size", fontSize);
  }, [fontSize]);

  return (
    <SettingsContext.Provider value={{ theme, fontSize, setTheme, setFontSize }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
};
