"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TeamMember {
  photo: string;
  name: string;
  role: string;
}

const teamMembers: TeamMember[] = [
  {
    photo: "/she.png",
    name: "Sherwin Bernardo",
    role: "Data Collection & Preprocessing — Gathered and cleaned climate datasets from authoritative sources including NASA, FAO, and Our World in Data.",
  },
  {
    photo: "/miks.png",
    name: "Miko Calderon",
    role: "Model Training & API Development — Built the machine learning prediction models and backend simulation infrastructure.",
  },
  {
    photo: "/raf.png",
    name: "Rafael Ramos",
    role: "Frontend & Visualization — Developed the interactive comparison interface and data visualization components.",
  },
];

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }

  return (
    <div
      ref={overlayRef}
      className="about-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
    >
      <div className="about-modal">
        <div className="about-modal-header">
          <h2 id="about-modal-title">About this Project</h2>
          <button
            className="about-modal-close"
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </div>

        <div className="about-modal-content">
          <section className="about-section">
            <h3>Purpose</h3>
            <div className="about-purpose">
              <p>
                Climate change is a real and growing crisis whose effects are already measurable in
                global temperature records. From rising average temperatures to shifting weather
                patterns, the data tells a clear and urgent story about our planet's changing
                climate.
              </p>
              <p>
                Understanding temperature trends is critical for informing future planning, policy
                decisions, and public awareness. By projecting where we're headed under
                different scenarios, we can make more informed choices about the actions we take
                today — and see how those choices compound over decades.
              </p>
              <p>
                This project explores how machine learning and real-world climate datasets can be
                used to predict future warming scenarios and visualize their potential impact on
                human health, food systems, coastal flooding, and ecosystems. Using historical data
                from sources like NASA, the FAO, and Our World in Data, combined with statistical
                modeling techniques, we build interactive comparisons that make the abstract
                concrete — showing not just where temperatures might go, but what that means for
                real-world impacts that affect people and planet.
              </p>
            </div>
          </section>

          <section className="about-section">
            <h3>The Team</h3>
            <div className="team-grid">
              {teamMembers.map((member, index) => (
                <div key={index} className="team-card">
                  <div className="team-photo">
                    <Image
                      src={member.photo}
                      alt={`Photo of ${member.name}`}
                      width={120}
                      height={120}
                      style={{ objectFit: "cover" }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const fallback = target.parentElement?.querySelector(
                          ".team-photo-fallback",
                        ) as HTMLElement;
                        if (fallback) {
                          fallback.style.display = "flex";
                        }
                      }}
                    />
                    <div className="team-photo-fallback">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 48 48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="24" cy="16" r="10" />
                        <path d="M4 44c0-11 9-20 20-20s20 9 20 20" />
                      </svg>
                    </div>
                  </div>
                  <div className="team-info">
                    <h4>{member.name}</h4>
                    <p>{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}