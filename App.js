import React, { useMemo, useState } from "react";
import "./styles.css";

const NUMBERS = [0, 1, 2, 3, 4, 5, 6];

const DEFAULT_HAND = [
  "6-6",
  "6-4",
  "4-2",
  "3-3",
  "2-2",
  "5-2",
  "1-0",
];

function normalizeTile(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return "";
  return x >= y ? `${x}-${y}` : `${y}-${x}`;
}

function parseTile(tile) {
  const [a, b] = tile.split("-").map(Number);
  return [a, b];
}

function tileLabel(tile) {
  return tile.replace("-", "|");
}

function tilePips(tile) {
  const [a, b] = parseTile(tile);
  return a + b;
}

function isDouble(tile) {
  const [a, b] = parseTile(tile);
  return a === b;
}

function buildFullSet() {
  const tiles = [];
  for (let high = 0; high <= 6; high += 1) {
    for (let low = 0; low <= high; low += 1) {
      tiles.push(`${high}-${low}`);
    }
  }
  return tiles;
}

const FULL_SET = buildFullSet();

function legalSides(tile, leftEnd, rightEnd) {
  const [a, b] = parseTile(tile);
  const sides = [];
  if (a === leftEnd || b === leftEnd) sides.push("left");
  if (a === rightEnd || b === rightEnd) sides.push("right");
  return sides;
}

function getLegalMoves(hand, leftEnd, rightEnd) {
  if (leftEnd === "" || rightEnd === "") return [];
  const l = Number(leftEnd);
  const r = Number(rightEnd);

  return hand.flatMap((tile) =>
    legalSides(tile, l, r).map((side) => ({
      tile,
      side,
      end: side === "left" ? l : r,
    }))
  );
}

function getNewEnds(move, leftEnd, rightEnd) {
  const [a, b] = parseTile(move.tile);
  const playedOn = move.side === "left" ? Number(leftEnd) : Number(rightEnd);
  const newNumber = a === playedOn ? b : a;

  if (move.side === "left") {
    return { left: newNumber, right: Number(rightEnd) };
  }
  return { left: Number(leftEnd), right: newNumber };
}

function countNumberInTiles(tiles, number) {
  return tiles.reduce((count, tile) => {
    const [a, b] = parseTile(tile);
    return count + (a === number ? 1 : 0) + (b === number ? 1 : 0);
  }, 0);
}

function uniqueNumbersInHand(hand) {
  return [...new Set(hand.flatMap(parseTile))];
}

function estimateUnknownTiles(hand, boardTiles) {
  const known = new Set([...hand, ...boardTiles]);
  return FULL_SET.filter((tile) => !known.has(tile));
}

function scoreMove({
  move,
  hand,
  leftEnd,
  rightEnd,
  boardTiles,
  passed,
  gameMode,
  scoreUs,
  scoreThem,
}) {
  const remainingHand = hand.filter((tile) => tile !== move.tile);
  const unknownTiles = estimateUnknownTiles(hand, boardTiles);
  const newEnds = getNewEnds(move, leftEnd, rightEnd);
  const exposed = [newEnds.left, newEnds.right];

  let score = 50;
  const reasons = [];
  const warnings = [];

  const playedPips = tilePips(move.tile);
  const remainingPips = remainingHand.reduce((sum, tile) => sum + tilePips(tile), 0);

  // Lower pip risk matters more when the game is close or late.
  score += Math.min(18, playedPips * 1.5);
  if (playedPips >= 10) reasons.push("drops high pips so you are safer if the hand blocks");

  // Doubles can be powerful but dangerous if saved too long.
  if (isDouble(move.tile)) {
    score += 5;
    reasons.push("gets a double out while it is playable");
  }

  // Keep playable follow-up numbers.
  const followUpCount = exposed.reduce(
    (sum, number) => sum + countNumberInTiles(remainingHand, number),
    0
  );
  score += followUpCount * 7;

  if (followUpCount >= 2) {
    reasons.push("keeps you with follow-up plays on the new board ends");
  } else if (followUpCount === 0) {
    score -= 12;
    warnings.push("you may not have a follow-up if the board comes back the same way");
  }

  // Control: reward exposing numbers you still own.
  const myNumbers = uniqueNumbersInHand(remainingHand);
  exposed.forEach((num) => {
    const myCount = countNumberInTiles(remainingHand, num);
    const unknownCount = countNumberInTiles(unknownTiles, num);

    if (myCount >= 2) {
      score += 12;
      reasons.push(`keeps control of ${num}s because you still hold several of them`);
    }

    if (myCount === 0 && unknownCount >= 5) {
      score -= 10;
      warnings.push(`opens ${num}s even though you do not control them`);
    }
  });

  // Passed-number logic.
  const allPasses = [...passed.leftOpponent, ...passed.rightOpponent, ...passed.partner];
  exposed.forEach((num) => {
    const oppPassed = passed.leftOpponent.includes(num) || passed.rightOpponent.includes(num);
    const partnerPassed = passed.partner.includes(num);

    if (oppPassed) {
      score += 14;
      reasons.push(`pressures an opponent who already passed on ${num}`);
    }

    if (partnerPassed) {
      score -= 10;
      warnings.push(`may hurt your partner because they passed on ${num}`);
    }
  });

  // Blocking potential.
  const unknownEndCoverage = exposed.reduce(
    (sum, num) => sum + countNumberInTiles(unknownTiles, num),
    0
  );

  if (unknownEndCoverage <= 5) {
    score += 9;
    reasons.push("creates a tighter board with fewer unknown tiles that can answer");
  }

  // Avoid killing your own strongest number.
  const beforeCounts = NUMBERS.map((n) => ({ n, count: countNumberInTiles(hand, n) }));
  const strongest = beforeCounts.sort((a, b) => b.count - a.count)[0];

  if (strongest && strongest.count >= 3 && !exposed.includes(strongest.n) && move.tile.includes(String(strongest.n))) {
    score -= 8;
    warnings.push(`uses a ${strongest.n} without keeping ${strongest.n}s open`);
  }

  // Score pressure by mode.
  const target = gameMode === "pr500" ? 500 : 200;
  const usNeed = target - Number(scoreUs || 0);
  const themNeed = target - Number(scoreThem || 0);

  if (themNeed <= 75 && remainingPips > 15) {
    score += playedPips >= 8 ? 8 : -4;
    reasons.push("score pressure is high, so dumping pips matters");
  }

  if (usNeed <= 75 && followUpCount >= 1) {
    score += 5;
    reasons.push("keeps you active while your team is close to finishing the game");
  }

  // Puerto Rican style: capi/endgame notes.
  if (gameMode === "pr500") {
    const sameEnd = newEnds.left === newEnds.right;
    if (sameEnd) {
      score += 5;
      reasons.push("creates matching ends, which can set up strong capi pressure");
    }

    if (remainingHand.length <= 3 && followUpCount >= 1) {
      score += 10;
      reasons.push("strong late-hand move because it keeps an exit path for capi/endgame");
    }
  }

  let risk = "Medium";
  if (score >= 78) risk = "Low";
  if (score < 55) risk = "High";

  return {
    ...move,
    newEnds,
    score: Math.round(score),
    risk,
    reasons: [...new Set(reasons)].slice(0, 4),
    warnings: [...new Set(warnings)].slice(0, 3),
  };
}

function analyzePosition(input) {
  const legalMoves = getLegalMoves(input.hand, input.leftEnd, input.rightEnd);

  if (!legalMoves.length) {
    return {
      legalMoves: [],
      best: null,
      message: "No legal moves. You would pass from this position.",
    };
  }

  const ranked = legalMoves
    .map((move) => scoreMove({ ...input, move }))
    .sort((a, b) => b.score - a.score);

  return {
    legalMoves: ranked,
    best: ranked[0],
    message: "",
  };
}

function TileButton({ tile, selected, onClick }) {
  return (
    <button className={`tile ${selected ? "selected" : ""}`} onClick={onClick} type="button">
      <span>{parseTile(tile)[0]}</span>
      <i />
      <span>{parseTile(tile)[1]}</span>
    </button>
  );
}

function NumberPicker({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {NUMBERS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function PassedPicker({ title, values, setValues }) {
  function toggle(num) {
    setValues((current) =>
      current.includes(num) ? current.filter((x) => x !== num) : [...current, num]
    );
  }

  return (
    <div className="pass-card">
      <h4>{title}</h4>
      <div className="number-row">
        {NUMBERS.map((num) => (
          <button
            key={num}
            type="button"
            className={values.includes(num) ? "num active" : "num"}
            onClick={() => toggle(num)}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [hand, setHand] = useState(DEFAULT_HAND);
  const [newA, setNewA] = useState("6");
  const [newB, setNewB] = useState("5");
  const [leftEnd, setLeftEnd] = useState("6");
  const [rightEnd, setRightEnd] = useState("2");
  const [boardTilesText, setBoardTilesText] = useState("6-2");
  const [gameMode, setGameMode] = useState("pr500");
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreThem, setScoreThem] = useState(0);
  const [passed, setPassed] = useState({
    leftOpponent: [],
    partner: [],
    rightOpponent: [],
  });

  const boardTiles = useMemo(
    () =>
      boardTilesText
        .split(/[,\s]+/)
        .map((tile) => tile.trim().replace("|", "-"))
        .filter(Boolean)
        .map((tile) => {
          const [a, b] = tile.split("-").map(Number);
          return normalizeTile(a, b);
        })
        .filter(Boolean),
    [boardTilesText]
  );

  const analysis = useMemo(
    () =>
      analyzePosition({
        hand,
        leftEnd,
        rightEnd,
        boardTiles,
        passed,
        gameMode,
        scoreUs,
        scoreThem,
      }),
    [hand, leftEnd, rightEnd, boardTiles, passed, gameMode, scoreUs, scoreThem]
  );

  function addTile() {
    const tile = normalizeTile(newA, newB);
    if (!tile || hand.includes(tile)) return;
    setHand((current) => [...current, tile]);
  }

  function removeTile(tile) {
    setHand((current) => current.filter((x) => x !== tile));
  }

  function resetDemo() {
    setHand(DEFAULT_HAND);
    setLeftEnd("6");
    setRightEnd("2");
    setBoardTilesText("6-2");
    setPassed({
      leftOpponent: [],
      partner: [],
      rightOpponent: [],
    });
    setScoreUs(0);
    setScoreThem(0);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Domino Move Advisor</p>
          <h1>Analyze the board and find your strongest move.</h1>
          <p>
            Enter your hand, board ends, passed numbers, and score. The advisor ranks your
            legal moves using control, blocking, pip risk, partner impact, and Puerto Rican
            domino strategy.
          </p>
        </div>
        <button className="ghost" onClick={resetDemo} type="button">
          Reset demo hand
        </button>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>1. Game setup</h2>
          <div className="form-grid">
            <label className="field">
              <span>Game mode</span>
              <select value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
                <option value="pr500">Puerto Rican 500</option>
                <option value="classic200">Classic 200</option>
              </select>
            </label>

            <label className="field">
              <span>Your team score</span>
              <input
                type="number"
                value={scoreUs}
                onChange={(e) => setScoreUs(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Opponent score</span>
              <input
                type="number"
                value={scoreThem}
                onChange={(e) => setScoreThem(e.target.value)}
              />
            </label>
          </div>

          <div className="ends">
            <NumberPicker label="Left board end" value={leftEnd} onChange={setLeftEnd} />
            <NumberPicker label="Right board end" value={rightEnd} onChange={setRightEnd} />
          </div>

          <label className="field wide">
            <span>Known board tiles already played</span>
            <input
              value={boardTilesText}
              onChange={(e) => setBoardTilesText(e.target.value)}
              placeholder="Example: 6-6 6-2 2-4"
            />
          </label>
        </div>

        <div className="panel">
          <h2>2. Your hand</h2>
          <div className="tile-input">
            <NumberPicker label="Side A" value={newA} onChange={setNewA} />
            <NumberPicker label="Side B" value={newB} onChange={setNewB} />
            <button className="primary" onClick={addTile} type="button">
              Add tile
            </button>
          </div>

          <div className="hand">
            {hand.map((tile) => (
              <TileButton
                key={tile}
                tile={tile}
                selected={false}
                onClick={() => removeTile(tile)}
              />
            ))}
          </div>

          <p className="hint">Tap a tile to remove it.</p>
        </div>

        <div className="panel full">
          <h2>3. Passed numbers</h2>
          <p className="section-note">
            Mark numbers that each seat already passed on. This is one of the biggest clues
            in dominoes.
          </p>
          <div className="pass-grid">
            <PassedPicker
              title="Left opponent passed"
              values={passed.leftOpponent}
              setValues={(fn) =>
                setPassed((current) => ({
                  ...current,
                  leftOpponent: fn(current.leftOpponent),
                }))
              }
            />
            <PassedPicker
              title="Partner passed"
              values={passed.partner}
              setValues={(fn) =>
                setPassed((current) => ({
                  ...current,
                  partner: fn(current.partner),
                }))
              }
            />
            <PassedPicker
              title="Right opponent passed"
              values={passed.rightOpponent}
              setValues={(fn) =>
                setPassed((current) => ({
                  ...current,
                  rightOpponent: fn(current.rightOpponent),
                }))
              }
            />
          </div>
        </div>

        <div className="panel results full">
          <h2>4. Best move</h2>

          {!analysis.best ? (
            <div className="empty-result">{analysis.message}</div>
          ) : (
            <>
              <div className="best-card">
                <div>
                  <p className="eyebrow">Recommended</p>
                  <h3>
                    Play {tileLabel(analysis.best.tile)} on the {analysis.best.side} side
                  </h3>
                  <p>
                    New board ends: <strong>{analysis.best.newEnds.left}</strong> and{" "}
                    <strong>{analysis.best.newEnds.right}</strong>
                  </p>
                </div>
                <div className={`risk ${analysis.best.risk.toLowerCase()}`}>
                  {analysis.best.risk} risk
                </div>
              </div>

              <div className="explain">
                <h4>Why this move ranks first</h4>
                <ul>
                  {analysis.best.reasons.length ? (
                    analysis.best.reasons.map((reason) => <li key={reason}>{reason}</li>)
                  ) : (
                    <li>It is the strongest legal move by the current scoring model.</li>
                  )}
                </ul>

                {analysis.best.warnings.length > 0 && (
                  <>
                    <h4>Watch out</h4>
                    <ul className="warnings">
                      {analysis.best.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <h3 className="rank-title">Move rankings</h3>
              <div className="rankings">
                {analysis.legalMoves.map((move, index) => (
                  <div className="rank-row" key={`${move.tile}-${move.side}`}>
                    <span className="rank">#{index + 1}</span>
                    <span>
                      {tileLabel(move.tile)} on {move.side}
                    </span>
                    <span>
                      Ends: {move.newEnds.left}/{move.newEnds.right}
                    </span>
                    <strong>{move.score}</strong>
                    <em className={`risk-text ${move.risk.toLowerCase()}`}>{move.risk}</em>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
