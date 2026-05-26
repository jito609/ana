import React, { useMemo, useState } from "react";
import "./styles.css";

const NUMBERS = [0, 1, 2, 3, 4, 5, 6];

const PLAYERS_RIGHT_ORDER = [
  { id: "me", label: "Me", team: "us" },
  { id: "rightOpponent", label: "Right Opponent", team: "them" },
  { id: "partner", label: "Partner", team: "us" },
  { id: "leftOpponent", label: "Left Opponent", team: "them" },
];

const DEFAULT_MY_HAND = ["6-6", "6-4", "5-2", "4-2", "3-3", "2-1", "1-0"];

function buildFullSet() {
  const tiles = [];
  for (let high = 0; high <= 6; high++) {
    for (let low = 0; low <= high; low++) {
      tiles.push(`${high}-${low}`);
    }
  }
  return tiles;
}

const FULL_SET = buildFullSet();

function parseTile(tile) {
  return tile.split("-").map(Number);
}

function normalizeTile(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return "";
  return x >= y ? `${x}-${y}` : `${y}-${x}`;
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

function getPlayerLabel(id) {
  return PLAYERS_RIGHT_ORDER.find((p) => p.id === id)?.label || id;
}

function getNextPlayerRight(id) {
  const index = PLAYERS_RIGHT_ORDER.findIndex((p) => p.id === id);
  return PLAYERS_RIGHT_ORDER[(index + 1) % PLAYERS_RIGHT_ORDER.length];
}

function getLegalSides(tile, leftEnd, rightEnd) {
  if (leftEnd === null || rightEnd === null) return ["center"];

  const [a, b] = parseTile(tile);
  const sides = [];

  if (a === leftEnd || b === leftEnd) sides.push("left");
  if (a === rightEnd || b === rightEnd) sides.push("right");

  return sides;
}

function getNewEnds(tile, side, leftEnd, rightEnd) {
  if (side === "center" || leftEnd === null || rightEnd === null) {
    const [a, b] = parseTile(tile);
    return { leftEnd: a, rightEnd: b };
  }

  const [a, b] = parseTile(tile);

  if (side === "left") {
    const newLeft = a === leftEnd ? b : a;
    return { leftEnd: newLeft, rightEnd };
  }

  const newRight = a === rightEnd ? b : a;
  return { leftEnd, rightEnd: newRight };
}

function removeOneTile(hand, tileToRemove) {
  let removed = false;
  return hand.filter((tile) => {
    if (!removed && tile === tileToRemove) {
      removed = true;
      return false;
    }
    return true;
  });
}

function countNumberInTiles(tiles, number) {
  return tiles.reduce((total, tile) => {
    const [a, b] = parseTile(tile);
    return total + (a === number ? 1 : 0) + (b === number ? 1 : 0);
  }, 0);
}

function getRemainingUnknownTiles(myHand, playedTiles) {
  const known = new Set([...myHand, ...playedTiles]);
  return FULL_SET.filter((tile) => !known.has(tile));
}

function getPassWeakness(passLog) {
  const weakness = {
    rightOpponent: [],
    partner: [],
    leftOpponent: [],
  };

  passLog.forEach((pass) => {
    if (!weakness[pass.playerId]) return;
    if (pass.leftEnd !== null && !weakness[pass.playerId].includes(pass.leftEnd)) {
      weakness[pass.playerId].push(pass.leftEnd);
    }
    if (pass.rightEnd !== null && !weakness[pass.playerId].includes(pass.rightEnd)) {
      weakness[pass.playerId].push(pass.rightEnd);
    }
  });

  return weakness;
}

function analyzeMyMove({ myHand, playedTiles, leftEnd, rightEnd, passLog }) {
  if (leftEnd === null || rightEnd === null) {
    if (myHand.includes("6-6")) {
      return {
        message: "",
        moves: [
          {
            tile: "6-6",
            side: "center",
            score: 100,
            risk: "Low",
            newEnds: { leftEnd: 6, rightEnd: 6 },
            reasons: ["first hand starts with 6|6"],
            warnings: [],
          },
        ],
      };
    }

    return {
      message: "Board has not started yet. If this is the first hand, the player with 6|6 starts.",
      moves: [],
    };
  }

  const legalMoves = myHand.flatMap((tile) =>
    getLegalSides(tile, leftEnd, rightEnd)
      .filter((side) => side !== "center")
      .map((side) => ({ tile, side }))
  );

  if (!legalMoves.length) {
    return {
      message: "You have no legal play. You should pass.",
      moves: [],
    };
  }

  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);
  const weakness = getPassWeakness(passLog);

  const moves = legalMoves
    .map((move) => {
      const newEnds = getNewEnds(move.tile, move.side, leftEnd, rightEnd);
      const remainingHand = removeOneTile(myHand, move.tile);
      const exposed = [newEnds.leftEnd, newEnds.rightEnd];

      let score = 50;
      const reasons = [];
      const warnings = [];

      const pips = tilePips(move.tile);
      const followUpCount = exposed.reduce(
        (sum, n) => sum + countNumberInTiles(remainingHand, n),
        0
      );

      score += Math.min(20, pips * 1.5);

      if (pips >= 9) reasons.push("drops high pips");
      if (isDouble(move.tile)) reasons.push("gets a double out");

      if (remainingHand.length === 0) {
        score += 100;
        reasons.push("this gets you out");
      }

      if (followUpCount >= 2) {
        score += 18;
        reasons.push("keeps you with strong follow-up plays");
      } else if (followUpCount === 1) {
        score += 8;
        reasons.push("keeps one follow-up play");
      } else {
        score -= 15;
        warnings.push("you may not have a follow-up if the board comes back");
      }

      exposed.forEach((number) => {
        const myCount = countNumberInTiles(remainingHand, number);
        const unknownCount = countNumberInTiles(unknownTiles, number);

        if (myCount >= 2) {
          score += 12;
          reasons.push(`you still control ${number}s`);
        }

        if (myCount === 0 && unknownCount >= 5) {
          score -= 8;
          warnings.push(`opens ${number}s without you controlling them`);
        }

        if (unknownCount <= 2) {
          score += 8;
          reasons.push(`${number}s look tight`);
        }

        if (weakness.rightOpponent.includes(number)) {
          score += 12;
          reasons.push(`right opponent passed on ${number}`);
        }

        if (weakness.leftOpponent.includes(number)) {
          score += 8;
          reasons.push(`left opponent passed on ${number}`);
        }

        if (weakness.partner.includes(number)) {
          score -= 10;
          warnings.push(`partner passed on ${number}`);
        }
      });

      score = Math.max(0, Math.min(100, Math.round(score)));

      let risk = "Medium";
      if (score >= 78) risk = "Low";
      if (score < 55) risk = "High";

      return {
        ...move,
        newEnds,
        score,
        risk,
        reasons: [...new Set(reasons)].slice(0, 5),
        warnings: [...new Set(warnings)].slice(0, 4),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    message: "",
    moves,
  };
}

function Tile({ tile, onClick, disabled = false, selected = false }) {
  return (
    <button
      type="button"
      className={`tile ${selected ? "selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{parseTile(tile)[0]}</span>
      <i />
      <span>{parseTile(tile)[1]}</span>
    </button>
  );
}

function PlayerSelect({ value, onChange, label = "Player" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {PLAYERS_RIGHT_ORDER.map((player) => (
          <option key={player.id} value={player.id}>
            {player.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TileSelect({ value, onChange, usedTiles, allowUsed = false, label = "Tile" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {FULL_SET.map((tile) => (
          <option key={tile} value={tile} disabled={!allowUsed && usedTiles.has(tile)}>
            {tileLabel(tile)}
          </option>
        ))}
      </select>
    </label>
  );
}

function BoardVisual({ board }) {
  if (!board.length) {
    return (
      <div className="board-empty">
        Board is empty. Select who started and enter the first tile.
      </div>
    );
  }

  return (
    <div className="board-track">
      {board.map((play, index) => (
        <div key={play.id} className={`board-tile ${play.side}`}>
          <Tile tile={play.tile} disabled />
          <small>
            {index + 1}. {getPlayerLabel(play.playerId)}
          </small>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [myHand, setMyHand] = useState(DEFAULT_MY_HAND);
  const [board, setBoard] = useState([]);
  const [leftEnd, setLeftEnd] = useState(null);
  const [rightEnd, setRightEnd] = useState(null);
  const [currentTurn, setCurrentTurn] = useState("me");

  const [starter, setStarter] = useState("me");
  const [starterTile, setStarterTile] = useState("6-6");

  const [playPlayer, setPlayPlayer] = useState("me");
  const [playTile, setPlayTile] = useState("6-4");
  const [playSide, setPlaySide] = useState("right");

  const [passLog, setPassLog] = useState([]);

  const playedTiles = useMemo(() => board.map((play) => play.tile), [board]);

  const usedTiles = useMemo(() => new Set([...myHand, ...playedTiles]), [myHand, playedTiles]);

  const legalSidesForSelected = useMemo(
    () => getLegalSides(playTile, leftEnd, rightEnd),
    [playTile, leftEnd, rightEnd]
  );

  const advisor = useMemo(
    () => analyzeMyMove({ myHand, playedTiles, leftEnd, rightEnd, passLog }),
    [myHand, playedTiles, leftEnd, rightEnd, passLog]
  );

  const best = advisor.moves[0] || null;
  const backup = advisor.moves[1] || null;
  const avoid = advisor.moves.length > 1 ? advisor.moves[advisor.moves.length - 1] : null;

  function addTileToHand(tile) {
    if (usedTiles.has(tile)) return;
    setMyHand((current) => [...current, tile]);
  }

  function removeTileFromHand(index) {
    setMyHand((current) => current.filter((_, i) => i !== index));
  }

  function startHand() {
    const nextEnds = getNewEnds(starterTile, "center", null, null);
    const play = {
      id: Date.now(),
      playerId: starter,
      tile: starterTile,
      side: "center",
      leftEndAfter: nextEnds.leftEnd,
      rightEndAfter: nextEnds.rightEnd,
    };

    setBoard([play]);
    setLeftEnd(nextEnds.leftEnd);
    setRightEnd(nextEnds.rightEnd);
    setCurrentTurn(getNextPlayerRight(starter).id);

    if (starter === "me") {
      setMyHand((current) => removeOneTile(current, starterTile));
    }

    setPlayPlayer(getNextPlayerRight(starter).id);
  }

  function addPlay() {
    const sides = getLegalSides(playTile, leftEnd, rightEnd);
    if (!sides.includes(playSide)) return;

    const nextEnds = getNewEnds(playTile, playSide, leftEnd, rightEnd);

    const play = {
      id: Date.now(),
      playerId: playPlayer,
      tile: playTile,
      side: playSide,
      leftEndAfter: nextEnds.leftEnd,
      rightEndAfter: nextEnds.rightEnd,
    };

    setBoard((current) => [...current, play]);
    setLeftEnd(nextEnds.leftEnd);
    setRightEnd(nextEnds.rightEnd);

    if (playPlayer === "me") {
      setMyHand((current) => removeOneTile(current, playTile));
    }

    const next = getNextPlayerRight(playPlayer);
    setCurrentTurn(next.id);
    setPlayPlayer(next.id);
  }

  function addPass() {
    setPassLog((current) => [
      ...current,
      {
        id: Date.now(),
        playerId: playPlayer,
        leftEnd,
        rightEnd,
      },
    ]);

    const next = getNextPlayerRight(playPlayer);
    setCurrentTurn(next.id);
    setPlayPlayer(next.id);
  }

  function undoLast() {
    const last = board[board.length - 1];
    if (!last) return;

    const newBoard = board.slice(0, -1);
    setBoard(newBoard);

    if (last.playerId === "me") {
      setMyHand((current) => [...current, last.tile]);
    }

    if (newBoard.length === 0) {
      setLeftEnd(null);
      setRightEnd(null);
      setCurrentTurn("me");
      setPlayPlayer("me");
    } else {
      const lastRemaining = newBoard[newBoard.length - 1];
      setLeftEnd(lastRemaining.leftEndAfter);
      setRightEnd(lastRemaining.rightEndAfter);
      setCurrentTurn(last.playerId);
      setPlayPlayer(last.playerId);
    }
  }

  function resetEverything() {
    setMyHand(DEFAULT_MY_HAND);
    setBoard([]);
    setLeftEnd(null);
    setRightEnd(null);
    setCurrentTurn("me");
    setStarter("me");
    setStarterTile("6-6");
    setPlayPlayer("me");
    setPlayTile("6-4");
    setPlaySide("right");
    setPassLog([]);
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Simple Live Domino Advisor</p>
          <h1>Input plays as they happen. Get your best move.</h1>
          <p>
            Add your hand, start the board, then enter each tile played. The board updates live and
            the advisor tells you what to play when it is your turn.
          </p>
        </div>
        <button className="ghost danger" type="button" onClick={resetEverything}>
          Reset
        </button>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="step">Step 1</p>
            <h2>My hand</h2>
          </div>
          <button className="mini danger" type="button" onClick={() => setMyHand([])}>
            Clear hand
          </button>
        </div>

        <div className="my-hand">
          {myHand.length ? (
            myHand.map((tile, index) => (
              <Tile key={`${tile}-${index}`} tile={tile} onClick={() => removeTileFromHand(index)} />
            ))
          ) : (
            <div className="empty">Tap tiles below to add your hand.</div>
          )}
        </div>

        <details className="picker">
          <summary>Add tiles to my hand</summary>
          <div className="tile-grid">
            {FULL_SET.map((tile) => (
              <Tile key={tile} tile={tile} disabled={usedTiles.has(tile)} onClick={() => addTileToHand(tile)} />
            ))}
          </div>
        </details>
      </section>

      <section className="grid">
        <section className="panel">
          <p className="step">Step 2</p>
          <h2>Start the hand</h2>

          <div className="form-grid">
            <PlayerSelect value={starter} onChange={setStarter} label="Who started?" />
            <TileSelect value={starterTile} onChange={setStarterTile} usedTiles={new Set(playedTiles)} allowUsed label="Starting tile" />
          </div>

          <button className="primary" type="button" onClick={startHand}>
            Start / Restart Board With This Tile
          </button>

          <div className="note">
            First hand rule: use <strong>6|6</strong>. After that, select whoever starts each hand and the tile they played.
          </div>
        </section>

        <section className="panel">
          <p className="step">Step 3</p>
          <h2>Add each play live</h2>

          <div className="turn-banner">
            Current turn: <strong>{getPlayerLabel(currentTurn)}</strong>
            <span>Next after this always moves right.</span>
          </div>

          <div className="form-grid">
            <PlayerSelect value={playPlayer} onChange={setPlayPlayer} label="Who played?" />
            <TileSelect value={playTile} onChange={setPlayTile} usedTiles={usedTiles} allowUsed={playPlayer === "me"} label="Tile played" />
            <label className="field">
              <span>Side</span>
              <select value={playSide} onChange={(e) => setPlaySide(e.target.value)}>
                <option value="left" disabled={!legalSidesForSelected.includes("left")}>
                  Left side
                </option>
                <option value="right" disabled={!legalSidesForSelected.includes("right")}>
                  Right side
                </option>
              </select>
            </label>
          </div>

          <div className="button-row">
            <button className="primary" type="button" onClick={addPlay}>
              Add Play
            </button>
            <button className="ghost" type="button" onClick={addPass}>
              Mark Pass
            </button>
            <button className="ghost danger" type="button" onClick={undoLast}>
              Undo Last Tile
            </button>
          </div>
        </section>
      </section>

      <section className="panel board-panel">
        <div className="section-head">
          <div>
            <p className="step">Live board</p>
            <h2>
              Ends: {leftEnd === null ? "?" : leftEnd} / {rightEnd === null ? "?" : rightEnd}
            </h2>
          </div>
        </div>
        <BoardVisual board={board} />
      </section>

      <section className="panel result-panel">
        <p className="step">Advisor</p>
        <h2>Best move for me</h2>

        {currentTurn !== "me" && (
          <div className="notice">
            It is currently <strong>{getPlayerLabel(currentTurn)}</strong>'s turn. Keep entering plays until it gets back to you.
          </div>
        )}

        {!best ? (
          <div className="empty">{advisor.message}</div>
        ) : (
          <>
            <div className="best-card">
              <div>
                <p className="eyebrow">Best play</p>
                <h3>
                  {tileLabel(best.tile)} on the {best.side} side
                </h3>
                <p>
                  New ends: <strong>{best.newEnds.leftEnd}</strong> / <strong>{best.newEnds.rightEnd}</strong>
                </p>
              </div>
              <div className={`score ${best.risk.toLowerCase()}`}>
                {best.score}/100
                <small>{best.risk} risk</small>
              </div>
            </div>

            <div className="small-results">
              {backup && (
                <div>
                  <span>Backup</span>
                  <strong>{tileLabel(backup.tile)} on {backup.side}</strong>
                </div>
              )}
              {avoid && avoid.tile !== best.tile && (
                <div>
                  <span>Be careful</span>
                  <strong>{tileLabel(avoid.tile)} on {avoid.side}</strong>
                </div>
              )}
            </div>

            <div className="explain-grid">
              <div className="explain">
                <h4>Why</h4>
                <ul>
                  {best.reasons.length ? best.reasons.map((r) => <li key={r}>{r}</li>) : <li>Best score from current board.</li>}
                </ul>
              </div>

              <div className="explain warn">
                <h4>Watch out</h4>
                {best.warnings.length ? (
                  <ul>
                    {best.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                ) : (
                  <p>No major warning.</p>
                )}
              </div>
            </div>

            <details className="picker">
              <summary>Show all legal moves</summary>
              <div className="rankings">
                {advisor.moves.map((move, index) => (
                  <div className="rank-row" key={`${move.tile}-${move.side}`}>
                    <strong>#{index + 1}</strong>
                    <span>{tileLabel(move.tile)} on {move.side}</span>
                    <span>Ends {move.newEnds.leftEnd}/{move.newEnds.rightEnd}</span>
                    <em>{move.score}/100</em>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </section>

      {passLog.length > 0 && (
        <section className="panel">
          <p className="step">Pass tracker</p>
          <h2>Passes remembered</h2>
          <div className="pass-list">
            {passLog.map((pass, index) => (
              <div key={pass.id}>
                #{index + 1} {getPlayerLabel(pass.playerId)} passed on ends {pass.leftEnd}/{pass.rightEnd}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
