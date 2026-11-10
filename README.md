# ♟️ Neon Chess Helper & HUD

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge&logo=github" alt="Status">
  <img src="https://img.shields.io/badge/Engine-Stockfish_10-blue?style=for-the-badge&logo=chess" alt="Engine">
  <img src="https://img.shields.io/badge/Platform-Android_%2F_WebView-orange?style=for-the-badge&logo=android" alt="Platform">
</p>

> An advanced open-source chess assistant built with a custom neon HUD overlay and Stockfish multi-PV analysis, designed for offline analysis and learning workflows.

---

## ✨ Features

* **3-Tier Humanized Move Tiers:** Automatically calculates top engine variations and splits them into **Good (Tier 1)**, **Medium (Tier 2)**, and **Weak (Tier 3)** to match natural play patterns.
* **Cyberpunk Neon Visual Overlay:** Custom SVG glow indicators, arrows, and target markers rendered directly onto the chess board.
* **Power Bar HUD:** Real-time evaluation meter showing advantage percentages on a sleek floating control panel.
* **Touch-Friendly Interface:** Draggable HUD panel designed smoothly for mobile screens and touch devices.

---

## ⚠️ Important Note for App Users (Login Notice)

If you are using the compiled APK version:
* **Google Login Only:** Please use the **"Log in with Google"** option when signing into Chess.com. Standard password login or manual email registration may trigger WebView CAPTCHA security blocks and fail to load.

---

## 🚀 Automated Build (GitHub Actions)

This repository includes a fully automated CI/CD workflow via GitHub Actions (`.github/workflows/build.yml`) that compiles the Cordova Android package and generates debug builds instantly on every push.

---

## 🛠️ Tech Stack

* **JavaScript (ES6+)** - Core logic & UI injector
* **Stockfish.js** - Local web-worker chess engine analysis
* **Apache Cordova** - Cross-platform mobile application wrapper
* **GitHub Actions** - Automated cloud APK compiler
