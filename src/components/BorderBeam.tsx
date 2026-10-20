/*!
 * Adapted from Magic UI Border Beam:
 * https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/border-beam.tsx
 * Uses SVG strokes along the perimeter in place of masked moving squares.
 *
 * MIT License
 * Copyright (c) Magic UI
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { CSSProperties } from "react";

const TRAIL = [
  { color: "#fff4e4", opacity: 1 },
  { color: "#ed7893", opacity: 1 },
  { color: "#e9b55f", opacity: 0.95 },
  { color: "#8ccf91", opacity: 0.9 },
  { color: "#65c9d5", opacity: 0.8 },
  { color: "#8794ec", opacity: 0.6 },
  { color: "#ca85df", opacity: 0.3 },
];

export function BorderBeam() {
  return (
    <span className="generation-border" aria-hidden="true">
      <svg className="generation-beams" xmlns="http://www.w3.org/2000/svg">
        {[0, 50].map((start) => (
          <g
            key={start}
            className={start === 50 ? "border-beam-secondary" : undefined}
          >
            {TRAIL.map(({ color, opacity }, index) => (
              <rect
                key={color}
                className="border-beam"
                pathLength={100}
                stroke={color}
                opacity={opacity}
                style={
                  {
                    "--beam-offset": `${start + index * 2.6}px`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        ))}
      </svg>
    </span>
  );
}
