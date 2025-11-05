# PPL Exam Preparation (Serbia)

Application for preparing theoretical PPL exams based on questions from the Civil Aviation Directorate of Serbia (CAD). Mobile interface: subject selection, quiz with shuffled answers, correct/incorrect marking, and automatic progression to the next question. When answering incorrectly, the app provides explanations in any language using OpenAI.

Technologies: Svelte + Vite + Cursor

## Installation and Setup

### Prerequisites
- Node.js
- [Task](https://taskfile.dev/)
- Homebrew (for macOS, to install `jq`)

### Install Dependencies
```bash
task install
```

### Run Development Server
```bash
task dev
```
Open `http://localhost:5173/ppl2025/`.

### Build for Production
```bash
task build
```

### Deploy to GitHub Pages
```bash
task deploy
```

Available at https://pshox.github.io/ppl2025/#/

Build output goes to `dist/`, `base` is configured in `vite.config.ts`.

### Release New Version
```bash
task release
```
Automatically increments version, commits, creates tag, and deploys.

## Available Tasks

- `task install` - Install dependencies (npm packages and jq)
- `task dev` - Run development server
- `task build` - Build static files for production
- `task deploy` - Deploy to GitHub Pages
- `task release` - Release new version (increment version, commit, tag, deploy)

## Data and Subjects

- Question banks are located in `public/data/*.json` (one file per subject).
- Subject list is in `src/subjects.ts`.
- Hash-based routing: subject selection `#/`, quiz `#/quiz?s=<id>`.

## Quiz Behavior

- Answers are shuffled on each question.
- On answer selection: correct is green, incorrect selected is red.
- After correct answer, a 1-second timer starts and moves to the next question.
- "Show correct answer" button highlights the correct answer.
- When answering incorrectly, explanations are provided in any language using OpenAI.
- Progress (question index) is saved per subject in `localStorage`.

## Adding a New Subject

1) Add file `public/data/<id>.json` with the same structure as existing ones.
2) In `src/subjects.ts` add `{ id: '<id>', title: '<Name>' }`.

## Disclaimer

This material is for educational and self-study purposes only. It is not intended for commercial use. Accuracy and currency of questions/answers are not guaranteed; verify with official CAD sources.
