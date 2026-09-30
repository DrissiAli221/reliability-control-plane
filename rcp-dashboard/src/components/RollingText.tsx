const DIGITS = "0123456789";

/**
 * Digits sit in vertical strips and roll to their new value when the text changes, like an odometer.
 * Columns are keyed from the right so units stay aligned when the number gains or loses a digit.
 */
export function RollingText({ value }: { value: string }) {
  const characters = [...value];
  return (
    <span className="rolling" aria-label={value} role="text">
      {characters.map((character, index) => {
        const position = characters.length - index;
        // A lone space collapses inside the flex row, so show it as a non-breaking space.
        if (!DIGITS.includes(character)) return <span key={`c${position}`} aria-hidden="true">{character === " " ? "\u00a0" : character}</span>;
        return (
          <span key={`d${position}`} className="rolling-digit" aria-hidden="true">
            <span className="rolling-strip" style={{ transform: `translateY(-${Number(character) * 10}%)` }}>
              {[...DIGITS].map((digit) => <span key={digit}>{digit}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
