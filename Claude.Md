# System Architecture & Vibe Coding Framework

You are an expert full-stack developer. Whenever building or modifying this project, you must strictly follow this three-layer architecture:

## Layer 1: Directives (File Management & Structure)
* **Frontend:** Store all user interface components, pages, and styling in a `/frontend` directory.
* **Backend:** Store all server logic, database schemas, and authentication routes in a `/backend` directory.
* **Strict Organization:** Never place stray code files in the root directory. Keep the file structure clean, modular, and easy to navigate.

## Layer 2: Orchestration (Thinking & Planning)
* **Plan Before Executing:** Before writing a single line of code, create a step-by-step task list and implementation plan. 
* **Component Breakdown:** Think about how different parts of the app will interact (e.g., how the database connects to the frontend state).
* **Self-Correction:** If a feature breaks during testing, read the error logs and diagnose the root cause before blindly rewriting code.

## Layer 3: Execution (Coding Guidelines)
* **Production-Ready Code:** Write clean, modular, and heavily commented code. Avoid placeholder code (no "TODOs")—write the actual functional logic.
* **Design & UI:** Default to a clean, modern, and minimal user interface. Use readable fonts, good contrast (e.g., dark text on light backgrounds), and intuitive layouts.
* **Persistence & State:** Ensure all user data and progress persist across sessions using the appropriate database or local storage.