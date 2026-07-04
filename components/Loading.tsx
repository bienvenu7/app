"use client";

import { motion } from "framer-motion";

const Loading = () => {
  return (
    <motion.span
      style={{ all: "unset", width: 40, height: 40 }}
      animate={{ rotate: 360 }}
      transition={{
        repeat: Infinity,
        duration: 1,
        ease: "linear",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 4V7.33333"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M16 24.668V28.0013"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M28.0009 16.0001L24.6665 16"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M7.33333 16L4 16.0001"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M24.4917 7.50781L22 10.0002"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M10 22L7.50781 24.4922"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M24.4917 24.4922L22 22"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M10 10.0002L7.50781 7.50781"
          stroke="#0D0B21"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </motion.span>
  );
};

export default Loading;
