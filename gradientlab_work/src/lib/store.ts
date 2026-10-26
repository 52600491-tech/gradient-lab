import { create } from "zustand";

type LabState = {
  theme: "dark" | "light";
  completed: number[];
  toggleTheme: () => void;
  markCompleted: (chapter: number) => void;
};

export const useLabStore = create<LabState>((set) => ({
  theme: "dark",
  completed: [],
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  markCompleted: (chapter) => set((state) => ({
    completed: state.completed.includes(chapter) ? state.completed : [...state.completed, chapter],
  })),
}));