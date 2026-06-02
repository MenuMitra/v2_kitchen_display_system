import React, { useRef, useEffect } from "react";
import "./PinInput.css";

function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  showPin = false,
  autoFocus = true,
  id = "pin-input",
}) {
  const refs = useRef([]);
  const digits = value.split("").concat(Array(length).fill("")).slice(0, length);

  useEffect(() => {
    if (autoFocus && refs.current[0]) {
      refs.current[0].focus();
    }
  }, [autoFocus]);

  const focusIndex = (index) => {
    if (refs.current[index]) refs.current[index].focus();
  };

  const handleChange = (index, raw) => {
    if (disabled) return;
    let val = raw.replace(/\D/g, "");
    if (val.length > 1) val = val[val.length - 1];

    const next = digits.slice();
    next[index] = val;
    const joined = next.join("").replace(/\s/g, "");
    onChange(joined);

    if (val && index < length - 1) {
      focusIndex(index + 1);
    }

    if (joined.length === length && onComplete) {
      onComplete(joined);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      focusIndex(index - 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === length && onComplete) {
      onComplete(pasted);
    } else {
      focusIndex(Math.min(pasted.length, length - 1));
    }
  };

  return (
    <div className="pin-input-container" id={id}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          className={`pin-input-box ${digit ? "filled" : ""} ${error ? "error" : ""} ${!showPin ? "pin-input-masked" : ""}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          autoComplete="off"
          aria-label={`PIN digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

export default PinInput;
