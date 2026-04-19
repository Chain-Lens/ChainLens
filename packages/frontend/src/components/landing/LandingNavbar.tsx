"use client";

import { useState, useEffect } from "react";
import styles from "./LandingNavbar.module.css";

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ""}`}>
      <a href="#" className={styles.logo}>
        ChainLens
      </a>
      <div className={styles.links}>
        <a href="#problem">Problem</a>
        <a href="#how">How it Works</a>
        <a href="#features">Features</a>
        <a href="#demo">Demo</a>
        <a
          href="https://forms.gle/EtCpnWtRcMeM7UtC7"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.cta}
        >
          Join Waitlist
        </a>
      </div>
    </nav>
  );
}
