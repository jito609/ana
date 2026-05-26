import React, { useEffect, useMemo, useState } from "react";
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
  for (let high = 0; high <= 6; high += 1) {
    for (let low = 0; low <= high; low += 1) {
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

function getStarterEnds(tile, flipped) {
  const [a, b] = parseTile(tile);
  return flipped ? { leftEnd: b, rightEnd: a } : { leftEnd: a, rightEnd: b };
}

function removeOneTile(hand, tileToRemove) {
  let removed = false;

  const nextHand = hand.filter((tile) => {
    if (!removed && tile === tileToRemove) {
      removed = true;
      return false;
    }

    return true;
  });

  return nextHand;
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

function getPlayedByPlayer(board, playerId) {
  return board.filter((play) => play.playerId === playerId).map((play) => play.tile);
}

function getEstimatedTilesLeft(board, playerId, myHand) {
  if (playerId === "me") return myHand.length;
  const playedCount = board.filter((play) => play.playerId === playerId).length;
  return Math.max(0, 7 - playedCount);
}

function getPlayerPassNumbers(passLog, playerId) {
  const nums = [];
  passLog
    .filter((pass) => pass.playerId === playerId)
    .forEach((pass) => {
      if (pass.leftEnd !== null && !nums.includes(pass.leftEnd)) nums.push(pass.leftEnd);
      if (pass.rightEnd !== null && !nums.includes(pass.rightEnd)) nums.push(pass.rightEnd);
    });
  return nums;
}

function getKnownPlayerProfile(board, passLog, playerId) {
  const played = getPlayedByPlayer(board, playerId);
  const passed = getPlayerPassNumbers(passLog, playerId);

  const counts = NUMBERS.map((number) => ({
    number,
    playedCount: countNumberInTiles(played, number),
    passed: passed.includes(number),
  }));

  return {
    played,
    passed,
    strongNumbers: counts
      .filter((item) => item.playedCount >= 2 && !item.passed)
      .map((item) => item.number),
    weakNumbers: passed,
  };
}

function getMyHandStrength(myHand, leftEnd, rightEnd) {
  if (!myHand.length) return { score: 0, reasons: ["no tiles in your hand"] };

  const legalMoves = leftEnd === null || rightEnd === null
    ? myHand
    : myHand.filter((tile) => getLegalSides(tile, leftEnd, rightEnd).some((side) => side !== "center"));

  const highPips = myHand.filter((tile) => tilePips(tile) >= 9).length;
  const doubles = myHand.filter(isDouble).length;
  const numbers = NUMBERS.map((number) => ({
    number,
    count: countNumberInTiles(myHand, number),
  }));
  const strongest = [...numbers].sort((a, b) => b.count - a.count)[0];

  let score = 25;
  const reasons = [];

  score += legalMoves.length * 10;
  score += highPips * 5;
  score += doubles * 4;

  if (strongest && strongest.count >= 4) {
    score += 20;
    reasons.push(`monster control in ${strongest.number}s`);
  } else if (strongest && strongest.count >= 3) {
    score += 10;
    reasons.push(`strong control in ${strongest.number}s`);
  }

  if (legalMoves.length >= 3) reasons.push("you have multiple legal options");
  if (highPips >= 3) reasons.push("you have heavy tiles that can pressure the hand");
  if (doubles >= 2) reasons.push("you have multiple doubles");

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.length ? reasons : ["normal hand strength"],
  };
}


function getGamePhase(board) {
  const playedCount = board.length;
  if (playedCount <= 8) return "early";
  if (playedCount <= 18) return "middle";
  return "late";
}

function getTilesRemaining(board) {
  return Math.max(0, 28 - board.length);
}

function getPlayableCount(hand, leftEnd, rightEnd) {
  if (leftEnd === null || rightEnd === null) return hand.length;
  return hand.filter((tile) => getLegalSides(tile, leftEnd, rightEnd).some((side) => side !== "center")).length;
}

function getFlexibilityScore(hand, leftEnd, rightEnd) {
  if (!hand.length) return 100;

  const numbersCovered = new Set();
  hand.forEach((tile) => {
    const [a, b] = parseTile(tile);
    numbersCovered.add(a);
    numbersCovered.add(b);
  });

  const playableCount = getPlayableCount(hand, leftEnd, rightEnd);
  const coverageScore = numbersCovered.size * 8;
  const playableScore = playableCount * 14;
  const handSizePenalty = Math.max(0, hand.length - 3) * 2;

  return Math.max(0, Math.min(100, Math.round(coverageScore + playableScore - handSizePenalty)));
}

function getDoubleEscapeChance({ doubleTile, hand, leftEnd, rightEnd, board, passLog, playedTiles }) {
  if (!isDouble(doubleTile)) return 100;

  const [number] = parseTile(doubleTile);
  const unknownTiles = getRemainingUnknownTiles(hand, playedTiles);
  const unknownCount = countNumberInTiles(unknownTiles, number);
  const myCount = countNumberInTiles(hand, number);
  const phase = getGamePhase(board);

  let chance = 20;

  if (leftEnd === number || rightEnd === number) chance += 35;
  chance += myCount * 10;

  if (unknownCount <= 2) chance += 15;
  if (unknownCount >= 5) chance -= 12;

  if (getPlayerPassNumbers(passLog, "rightOpponent").includes(number)) chance += 8;
  if (getPlayerPassNumbers(passLog, "leftOpponent").includes(number)) chance += 8;
  if (getPlayerPassNumbers(passLog, "partner").includes(number)) chance -= 10;

  if (phase === "late") chance += 18;
  if (phase === "early") chance -= 10;

  return Math.max(0, Math.min(100, Math.round(chance)));
}

function getDoubleRiskReport({ remainingHand, leftEnd, rightEnd, board, passLog, playedTiles }) {
  const phase = getGamePhase(board);
  const tilesRemaining = getTilesRemaining(board);
  const doubles = remainingHand.filter(isDouble);

  let penalty = 0;
  const warnings = [];
  const reasons = [];

  doubles.forEach((doubleTile) => {
    const [number] = parseTile(doubleTile);
    const supportCount = countNumberInTiles(remainingHand, number);
    const escapeChance = getDoubleEscapeChance({
      doubleTile,
      hand: remainingHand,
      leftEnd,
      rightEnd,
      board,
      passLog,
      playedTiles,
    });

    const isNaked = supportCount <= 2; // double itself counts as 2 pips of that number
    const isPlayableNow = leftEnd === number || rightEnd === number;

    if (isNaked && !isPlayableNow) {
      let thisPenalty = 14;

      if (phase === "early") thisPenalty += 10;
      if (phase === "middle") thisPenalty += 6;
      if (tilesRemaining >= 14) thisPenalty += 8;
      if (doubleTile === "0-0") thisPenalty += 14;

      if (escapeChance < 35) thisPenalty += 10;
      if (escapeChance > 65) thisPenalty -= 6;

      penalty += thisPenalty;

      if (doubleTile === "0-0") {
        warnings.push("naked 0|0 danger: this can trap the +100 tile if zeros get closed");
      } else {
        warnings.push(`isolated double risk: ${tileLabel(doubleTile)} may become dead weight`);
      }

      warnings.push(`double escape chance for ${tileLabel(doubleTile)} is only ${escapeChance}%`);
    }

    if (isPlayableNow && escapeChance >= 60) {
      reasons.push(`${tileLabel(doubleTile)} still has a reasonable escape path`);
    }
  });

  return {
    penalty: Math.max(0, Math.round(penalty)),
    warnings: [...new Set(warnings)].slice(0, 4),
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}


function estimateMyHandWinChance({ myHand, board, passLog, leftEnd, rightEnd, playedTiles, starter }) {
  if (leftEnd === null || rightEnd === null) {
    return {
      chance: myHand.includes("6-6") ? 58 : 38,
      label: myHand.includes("6-6") ? "Good opening control" : "Waiting for board start",
      reasons: myHand.includes("6-6")
        ? ["you can open with 6|6 if it is your start"]
        : ["board has not started yet"],
      details: {
        playableCount: 0,
        myPips: myHand.reduce((sum, tile) => sum + tilePips(tile), 0),
        phase: "not started",
        flexibility: 0,
      },
    };
  }

  const phase = getGamePhase(board);
  const tilesRemaining = getTilesRemaining(board);
  const playableCount = getPlayableCount(myHand, leftEnd, rightEnd);
  const myPips = myHand.reduce((sum, tile) => sum + tilePips(tile), 0);
  const flexibility = getFlexibilityScore(myHand, leftEnd, rightEnd);
  const teamBrain = getTeamBrain({ board, myHand, passLog, starter, leftEnd, rightEnd });
  const closeoutTeam = estimateCloseoutOdds({
    mode: "team",
    myHand,
    board,
    passLog,
    leftEnd,
    rightEnd,
    playedTiles,
  });
  const zeroZero = estimateZeroZeroBonus({
    myHand,
    board,
    passLog,
    leftEnd,
    rightEnd,
    playedTiles,
  });

  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);
  const rightOppCanPlay = estimateSeatCanPlayEnds({
    playerId: "rightOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });
  const partnerCanPlay = estimateSeatCanPlayEnds({
    playerId: "partner",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });
  const leftOppCanPlay = estimateSeatCanPlayEnds({
    playerId: "leftOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  let chance = 38;
  const reasons = [];

  chance += playableCount * 8;
  if (playableCount >= 3) reasons.push("you have multiple playable options");
  if (playableCount === 0) {
    chance -= 26;
    reasons.push("you currently have no legal play");
  }

  chance += Math.max(0, 7 - myHand.length) * 5;
  if (myHand.length <= 2) reasons.push("you are close to going out");
  if (myHand.length >= 5) reasons.push("you still have several tiles left");

  if (myPips <= 10) {
    chance += 14;
    reasons.push(`low remaining pips (${myPips})`);
  } else if (myPips >= 25) {
    chance -= 12;
    reasons.push(`high remaining pips (${myPips})`);
  } else {
    reasons.push(`moderate remaining pips (${myPips})`);
  }

  if (flexibility >= 70) {
    chance += 12;
    reasons.push("your hand has strong flexibility");
  } else if (flexibility <= 35) {
    chance -= 12;
    reasons.push("your hand flexibility is weak");
  }

  if (teamBrain.mode === "feedPartner") {
    chance += 6;
    reasons.push("team read says play through partner");
  }

  if (teamBrain.mode === "takeOver") {
    chance += 10;
    reasons.push("team read says your hand can take over");
  }

  if (teamBrain.mode === "blockOpponents") {
    chance += 5;
    reasons.push("team read says blocking opponents is urgent");
  }

  if (rightOppCanPlay < 40) {
    chance += 8;
    reasons.push("right opponent looks weak on current ends");
  } else if (rightOppCanPlay > 75) {
    chance -= 5;
    reasons.push("right opponent likely can answer");
  }

  if (leftOppCanPlay < 40) {
    chance += 6;
    reasons.push("left opponent looks weak on current ends");
  }

  if (partnerCanPlay > 60) {
    chance += 7;
    reasons.push("partner likely can keep the hand moving");
  } else if (partnerCanPlay < 35) {
    chance -= 6;
    reasons.push("partner may be weak on current ends");
  }

  chance += Math.round((closeoutTeam.chance - 50) * 0.18);

  if (zeroZero.possible && zeroZero.chance >= 45) {
    chance += 6;
    reasons.push("0|0 bonus finish is still realistic");
  }

  if (phase === "early" && tilesRemaining >= 16 && myHand.some((tile) => tile === "0-0")) {
    const zeroEscape = getDoubleEscapeChance({
      doubleTile: "0-0",
      hand: myHand,
      leftEnd,
      rightEnd,
      board,
      passLog,
      playedTiles,
    });

    if (zeroEscape < 40) {
      chance -= 10;
      reasons.push("naked 0|0 risk hurts your win chance");
    }
  }

  chance = clampScore(chance);

  let label = "Playable but uncertain";
  if (chance >= 75) label = "Strong winning position";
  else if (chance >= 60) label = "Good winning chance";
  else if (chance <= 35) label = "Danger position";
  else if (chance <= 48) label = "Slightly behind";

  return {
    chance,
    label,
    reasons: [...new Set(reasons)].slice(0, 6),
    details: {
      playableCount,
      myPips,
      phase,
      flexibility,
      tilesRemaining,
      rightOppCanPlay,
      partnerCanPlay,
      leftOppCanPlay,
      closeoutChance: closeoutTeam.chance,
      zeroZeroChance: zeroZero.chance,
    },
  };
}



function getPartnerPlanRead({ board, passLog, starter }) {
  const partnerPlayed = getPlayedByPlayer(board, "partner");
  const partnerPasses = getPlayerPassNumbers(passLog, "partner");
  const partnerProfile = getKnownPlayerProfile(board, passLog, "partner");

  const firstPartnerTile = partnerPlayed[0] || null;
  const lastPartnerTile = partnerPlayed[partnerPlayed.length - 1] || null;

  const reasons = [];

  if (starter === "partner") {
    reasons.push("partner started the hand, so treat partner as possible hand controller");
  }

  if (firstPartnerTile) {
    reasons.push(`partner first showed ${tileLabel(firstPartnerTile)}`);
  }

  if (partnerProfile.strongNumbers.length) {
    reasons.push(`partner appears strong in ${partnerProfile.strongNumbers.join(", ")}`);
  }

  if (partnerPasses.length) {
    reasons.push(`partner has passed on ${partnerPasses.join(", ")}`);
  }

  return {
    firstPartnerTile,
    lastPartnerTile,
    strongNumbers: partnerProfile.strongNumbers,
    weakNumbers: partnerPasses,
    reasons: reasons.length ? reasons : ["not enough partner information yet"],
  };
}

function estimateTeamWinChance({ myHand, board, passLog, leftEnd, rightEnd, playedTiles, starter }) {
  if (leftEnd === null || rightEnd === null) {
    return {
      chance: 50,
      confidence: "Low",
      label: "Not enough board data",
      reasons: ["start the board first"],
      details: {
        partnerPlan: getPartnerPlanRead({ board, passLog, starter }),
      },
    };
  }

  const myRead = estimateMyHandWinChance({
    myHand,
    board,
    passLog,
    leftEnd,
    rightEnd,
    playedTiles,
    starter,
  });

  const teamBrain = getTeamBrain({ board, myHand, passLog, starter, leftEnd, rightEnd });
  const partnerPlan = getPartnerPlanRead({ board, passLog, starter });
  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);

  const partnerCanPlay = estimateSeatCanPlayEnds({
    playerId: "partner",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const rightOppCanPlay = estimateSeatCanPlayEnds({
    playerId: "rightOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const leftOppCanPlay = estimateSeatCanPlayEnds({
    playerId: "leftOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const partnerTilesLeft = getEstimatedTilesLeft(board, "partner", myHand);
  const myTilesLeft = getEstimatedTilesLeft(board, "me", myHand);
  const rightOppTilesLeft = getEstimatedTilesLeft(board, "rightOpponent", myHand);
  const leftOppTilesLeft = getEstimatedTilesLeft(board, "leftOpponent", myHand);
  const lowestTeamTiles = Math.min(myTilesLeft, partnerTilesLeft);
  const lowestOppTiles = Math.min(rightOppTilesLeft, leftOppTilesLeft);

  let chance = 45;
  const reasons = [];

  chance += (myRead.chance - 50) * 0.38;

  if (partnerCanPlay >= 65) {
    chance += 12;
    reasons.push("partner likely can play on the current ends");
  } else if (partnerCanPlay <= 35) {
    chance -= 10;
    reasons.push("partner may be weak on the current ends");
  }

  if (partnerPlan.strongNumbers.some((n) => n === leftEnd || n === rightEnd)) {
    chance += 12;
    reasons.push("current board supports numbers partner has been showing");
  }

  if (partnerPlan.weakNumbers.some((n) => n === leftEnd || n === rightEnd)) {
    chance -= 10;
    reasons.push("current board hits numbers partner already passed on");
  }

  if (lowestTeamTiles < lowestOppTiles) {
    chance += 12;
    reasons.push("your team has the tile-count advantage");
  } else if (lowestOppTiles < lowestTeamTiles) {
    chance -= 12;
    reasons.push("opponents have the tile-count advantage");
  }

  if (rightOppCanPlay < 40) {
    chance += 7;
    reasons.push("right opponent looks weak on the current ends");
  }

  if (leftOppCanPlay < 40) {
    chance += 7;
    reasons.push("left opponent looks weak on the current ends");
  }

  if (teamBrain.mode === "feedPartner") {
    chance += 6;
    reasons.push("team brain says to play through partner");
  }

  if (teamBrain.mode === "blockOpponents") {
    chance += 5;
    reasons.push("team brain says blocking is urgent");
  }

  if (starter === "partner" && !partnerPlan.weakNumbers.length) {
    chance += 6;
    reasons.push("partner started and has not shown weakness yet");
  }

  const dataPoints = board.length + passLog.length;
  let confidence = "Low";
  if (dataPoints >= 10) confidence = "Medium";
  if (dataPoints >= 18) confidence = "Higher";

  // Prevent fake certainty. This is not a true simulator yet, it is a live estimate.
  const capHigh = confidence === "Low" ? 78 : confidence === "Medium" ? 88 : 94;
  const capLow = confidence === "Low" ? 22 : confidence === "Medium" ? 14 : 8;

  chance = Math.max(capLow, Math.min(capHigh, Math.round(chance)));

  let label = "Even / unclear";
  if (chance >= 70) label = "Team advantage";
  else if (chance >= 58) label = "Slight team edge";
  else if (chance <= 35) label = "Team in danger";
  else if (chance <= 45) label = "Slightly behind";

  return {
    chance,
    confidence,
    label,
    reasons: [...new Set([...reasons, ...partnerPlan.reasons])].slice(0, 7),
    details: {
      partnerPlan,
      partnerCanPlay,
      rightOppCanPlay,
      leftOppCanPlay,
      myTilesLeft,
      partnerTilesLeft,
      rightOppTilesLeft,
      leftOppTilesLeft,
    },
  };
}


function getMoveRiskUpgrade({ move, myHand, remainingHand, newEnds, board, passLog, playedTiles }) {
  const phase = getGamePhase(board);
  const tilesRemaining = getTilesRemaining(board);
  const beforeFlex = getFlexibilityScore(myHand, newEnds.leftEnd, newEnds.rightEnd);
  const afterFlex = getFlexibilityScore(remainingHand, newEnds.leftEnd, newEnds.rightEnd);
  const doubleRisk = getDoubleRiskReport({
    remainingHand,
    leftEnd: newEnds.leftEnd,
    rightEnd: newEnds.rightEnd,
    board,
    passLog,
    playedTiles: [...playedTiles, move.tile],
  });

  let adjustment = 0;
  const reasons = [];
  const warnings = [];

  const flexDrop = beforeFlex - afterFlex;

  if (afterFlex >= 70) {
    adjustment += 10;
    reasons.push("future flexibility stays strong after this move");
  } else if (afterFlex <= 35) {
    adjustment -= 14;
    warnings.push("future flexibility becomes weak after this move");
  }

  if (flexDrop >= 25) {
    adjustment -= 10;
    warnings.push("this move gives up too much future flexibility");
  }

  if (phase === "early" && tilesRemaining >= 16) {
    adjustment -= Math.round(doubleRisk.penalty * 1.15);
    if (doubleRisk.penalty > 0) warnings.push("early hand penalty: too many tiles are still out to risk a dead double");
  } else if (phase === "middle") {
    adjustment -= doubleRisk.penalty;
  } else {
    adjustment -= Math.round(doubleRisk.penalty * 0.55);
  }

  warnings.push(...doubleRisk.warnings);
  reasons.push(...doubleRisk.reasons);

  return {
    adjustment,
    phase,
    tilesRemaining,
    beforeFlex,
    afterFlex,
    doubleRisk,
    reasons: [...new Set(reasons)].slice(0, 5),
    warnings: [...new Set(warnings)].slice(0, 6),
  };
}


function getTeamBrain({ board, myHand, passLog, starter, leftEnd, rightEnd }) {
  const myTilesLeft = getEstimatedTilesLeft(board, "me", myHand);
  const partnerTilesLeft = getEstimatedTilesLeft(board, "partner", myHand);
  const rightOpponentTilesLeft = getEstimatedTilesLeft(board, "rightOpponent", myHand);
  const leftOpponentTilesLeft = getEstimatedTilesLeft(board, "leftOpponent", myHand);
  const lowestOpponentTiles = Math.min(rightOpponentTilesLeft, leftOpponentTilesLeft);
  const myStrength = getMyHandStrength(myHand, leftEnd, rightEnd);

  let mode = "balanced";
  const reasons = [];

  if (lowestOpponentTiles <= 2) {
    mode = "blockOpponents";
    reasons.push("an opponent is close to going out");
  }

  const partnerHasPassed = passLog.some((pass) => pass.playerId === "partner");
  const iHaveTileAdvantage = myTilesLeft < partnerTilesLeft;
  const iAmTiedOrAheadOfPartner = myTilesLeft <= partnerTilesLeft;

  if (partnerTilesLeft < myTilesLeft && !partnerHasPassed) {
    mode = "feedPartner";
    reasons.push("partner has fewer tiles than you and has not shown weakness yet");
  }

  if (starter === "partner" && partnerTilesLeft <= myTilesLeft && !partnerHasPassed) {
    mode = "feedPartner";
    reasons.push("partner started the hand and has not passed, so partner may still have control");
  }

  if (partnerHasPassed && iAmTiedOrAheadOfPartner) {
    mode = "takeOver";
    reasons.push("partner passed and you now have the better hand position");
  }

  if (iHaveTileAdvantage) {
    mode = "takeOver";
    reasons.push("you have fewer tiles than partner, so protect your own out path");
  }

  if (myTilesLeft <= 2 && myTilesLeft <= partnerTilesLeft) {
    mode = "takeOver";
    reasons.push("you are closest to going out");
  }

  if (myStrength.score >= 78 && myTilesLeft <= partnerTilesLeft + 1) {
    mode = "takeOver";
    reasons.push("you have a monster hand, so taking over is better");
  }

  return {
    mode,
    label:
      mode === "feedPartner"
        ? "Play for Partner"
        : mode === "blockOpponents"
        ? "Block Opponents"
        : mode === "takeOver"
        ? "Take Over"
        : "Balanced Team Play",
    reasons,
    myTilesLeft,
    partnerTilesLeft,
    rightOpponentTilesLeft,
    leftOpponentTilesLeft,
    myStrength,
  };
}


function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}




function estimateSeatCanAnswerNumber({ number, playerId, board, passLog, unknownTiles }) {
  const profile = getKnownPlayerProfile(board, passLog, playerId);
  const unknownCount = countNumberInTiles(unknownTiles, number);

  let chance = 45;

  if (profile.passed.includes(number)) chance -= 38;
  if (profile.strongNumbers.includes(number)) chance += 22;
  if (profile.played.some((tile) => parseTile(tile).includes(number))) chance += 8;

  chance += Math.min(18, unknownCount * 3);

  return clampScore(chance);
}

function estimateSeatCanPlayEnds({ playerId, leftEnd, rightEnd, board, passLog, unknownTiles }) {
  if (leftEnd === null || rightEnd === null) return 0;

  const leftChance = estimateSeatCanAnswerNumber({ number: leftEnd, playerId, board, passLog, unknownTiles });
  const rightChance = estimateSeatCanAnswerNumber({ number: rightEnd, playerId, board, passLog, unknownTiles });

  return clampScore(Math.max(leftChance, rightChance) + Math.min(leftChance, rightChance) * 0.25);
}

function estimateCapiChanceForMove({ move, myHand, board, passLog, leftEnd, rightEnd, playedTiles }) {
  const newEnds = getNewEnds(move.tile, move.side, leftEnd, rightEnd);
  const remainingHand = removeOneTile(myHand, move.tile);
  const unknownTiles = getRemainingUnknownTiles(remainingHand, [...playedTiles, move.tile]);
  const nextPlayer = getNextPlayerRight("me");
  const matchingEnds = newEnds.leftEnd === newEnds.rightEnd;

  let chance = 8;
  const reasons = [];

  if (matchingEnds) {
    chance += 28;
    reasons.push(`playing ${tileLabel(move.tile)} creates matching ${newEnds.leftEnd}/${newEnds.rightEnd} ends`);
  }

  const endNumber = matchingEnds ? newEnds.leftEnd : null;
  if (endNumber !== null) {
    const myControl = countNumberInTiles(remainingHand, endNumber);
    const unknownCount = countNumberInTiles(unknownTiles, endNumber);
    const rightOppPassed = getPlayerPassNumbers(passLog, "rightOpponent").includes(endNumber);
    const leftOppPassed = getPlayerPassNumbers(passLog, "leftOpponent").includes(endNumber);
    const partnerPassed = getPlayerPassNumbers(passLog, "partner").includes(endNumber);

    chance += myControl * 10;
    if (myControl >= 2) reasons.push(`you still control ${endNumber}s after the play`);

    if (unknownCount <= 2) {
      chance += 16;
      reasons.push(`few unknown ${endNumber}s remain`);
    }

    if (rightOppPassed) {
      chance += 14;
      reasons.push("right opponent already passed on that number");
    }

    if (leftOppPassed) {
      chance += 10;
      reasons.push("left opponent already passed on that number");
    }

    if (partnerPassed) {
      chance -= 10;
      reasons.push("partner passed on that number, so it may hurt your team flow");
    }
  }

  const remainingCount = remainingHand.length;
  if (remainingCount <= 2) {
    chance += 18;
    reasons.push("you are close to going out");
  } else if (remainingCount <= 4) {
    chance += 8;
    reasons.push("you are within striking distance");
  }

  const nextCanPlay = estimateSeatCanPlayEnds({
    playerId: nextPlayer.id,
    leftEnd: newEnds.leftEnd,
    rightEnd: newEnds.rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  if (nextCanPlay < 35) {
    chance += 12;
    reasons.push(`next player to the right looks unlikely to answer`);
  } else if (nextCanPlay > 70) {
    chance -= 12;
    reasons.push(`next player to the right may be able to answer`);
  }

  return {
    chance: clampScore(chance),
    reasons: reasons.slice(0, 4),
  };
}

function estimateCloseoutOdds({ mode, myHand, board, passLog, leftEnd, rightEnd, playedTiles }) {
  if (leftEnd === null || rightEnd === null) {
    return {
      chance: 0,
      reasons: ["board has not started yet"],
    };
  }

  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);
  const myPips = myHand.reduce((sum, tile) => sum + tilePips(tile), 0);

  const rightOpponentPlayChance = estimateSeatCanPlayEnds({
    playerId: "rightOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const partnerPlayChance = estimateSeatCanPlayEnds({
    playerId: "partner",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const leftOpponentPlayChance = estimateSeatCanPlayEnds({
    playerId: "leftOpponent",
    leftEnd,
    rightEnd,
    board,
    passLog,
    unknownTiles,
  });

  const opponentWeakness =
    (100 - rightOpponentPlayChance) * 0.45 +
    (100 - leftOpponentPlayChance) * 0.35;

  const partnerHelp = partnerPlayChance * 0.2;
  const lowPipBonus = Math.max(0, 30 - myPips) * 1.1;
  const handSizeBonus = Math.max(0, 7 - myHand.length) * 4;

  let chance = 20 + opponentWeakness + partnerHelp + lowPipBonus + handSizeBonus;

  const reasons = [];

  if (myPips <= 10) reasons.push(`your remaining pips are low (${myPips})`);
  else if (myPips >= 25) {
    chance -= 12;
    reasons.push(`your remaining pips are high (${myPips})`);
  } else {
    reasons.push(`your remaining pips are moderate (${myPips})`);
  }

  if (rightOpponentPlayChance < 40) reasons.push("right opponent looks weak on current ends");
  if (leftOpponentPlayChance < 40) reasons.push("left opponent looks weak on current ends");
  if (partnerPlayChance > 60) reasons.push("partner looks likely to keep the hand moving");

  if (mode === "individual") {
    chance -= 6;
    reasons.push("individual closeout only compares you against the player to your right");
  } else {
    chance += 5;
    reasons.push("team closeout compares your team against both opponents");
  }

  return {
    chance: clampScore(chance),
    reasons: reasons.slice(0, 5),
    details: {
      myPips,
      rightOpponentPlayChance,
      partnerPlayChance,
      leftOpponentPlayChance,
    },
  };
}

function estimateZeroZeroBonus({ myHand, board, passLog, leftEnd, rightEnd, playedTiles }) {
  if (!myHand.includes("0-0")) {
    return {
      chance: 0,
      possible: false,
      reasons: ["you do not currently have 0|0"],
    };
  }

  const legalSides = getLegalSides("0-0", leftEnd, rightEnd);
  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);
  let chance = 12;
  const reasons = ["0|0 is still in your hand"];

  if (legalSides.includes("left") || legalSides.includes("right")) {
    chance += 32;
    reasons.push("0|0 is playable right now");
  }

  const zeroControl = countNumberInTiles(myHand, 0);
  const unknownZeros = countNumberInTiles(unknownTiles, 0);

  chance += zeroControl * 6;

  if (zeroControl >= 3) reasons.push("you have strong zero control");
  if (unknownZeros <= 2) {
    chance += 14;
    reasons.push("few unknown zero tiles remain");
  }

  if (getPlayerPassNumbers(passLog, "rightOpponent").includes(0)) {
    chance += 10;
    reasons.push("right opponent has passed on zero");
  }

  if (getPlayerPassNumbers(passLog, "leftOpponent").includes(0)) {
    chance += 8;
    reasons.push("left opponent has passed on zero");
  }

  if (myHand.length <= 3) {
    chance += 14;
    reasons.push("you are close enough to realistically end with 0|0");
  }

  return {
    chance: clampScore(chance),
    possible: true,
    reasons: reasons.slice(0, 5),
  };
}

function getStrategicRead({ myHand, board, passLog, leftEnd, rightEnd, playedTiles, closeoutMode }) {
  const unknownTiles = getRemainingUnknownTiles(myHand, playedTiles);
  const profiles = PLAYERS_RIGHT_ORDER
    .filter((player) => player.id !== "me")
    .map((player) => ({
      ...player,
      profile: getKnownPlayerProfile(board, passLog, player.id),
      playChance: estimateSeatCanPlayEnds({
        playerId: player.id,
        leftEnd,
        rightEnd,
        board,
        passLog,
        unknownTiles,
      }),
    }));

  const closeout = estimateCloseoutOdds({
    mode: closeoutMode,
    myHand,
    board,
    passLog,
    leftEnd,
    rightEnd,
    playedTiles,
  });

  const zeroZero = estimateZeroZeroBonus({
    myHand,
    board,
    passLog,
    leftEnd,
    rightEnd,
    playedTiles,
  });

  return {
    profiles,
    closeout,
    zeroZero,
  };
}


function analyzeMyMove({ myHand, playedTiles, leftEnd, rightEnd, passLog, board = [], starter = "me" }) {
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
  const teamBrain = getTeamBrain({ board, myHand, passLog, starter, leftEnd, rightEnd });

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

      const riskUpgrade = getMoveRiskUpgrade({
        move,
        myHand,
        remainingHand,
        newEnds,
        board,
        passLog,
        playedTiles,
      });

      score += riskUpgrade.adjustment;
      reasons.push(...riskUpgrade.reasons);
      warnings.push(...riskUpgrade.warnings);

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
          score -= teamBrain.mode === "feedPartner" ? 18 : 10;
          warnings.push(`partner passed on ${number}`);
        }

        const partnerProfile = getKnownPlayerProfile(board, passLog, "partner");
        const rightProfile = getKnownPlayerProfile(board, passLog, "rightOpponent");
        const leftProfile = getKnownPlayerProfile(board, passLog, "leftOpponent");

        if (teamBrain.mode === "feedPartner") {
          if (partnerProfile.strongNumbers.includes(number)) {
            score += 20;
            reasons.push(`team play: this supports partner's strong ${number}s`);
          }

          if (partnerProfile.weakNumbers.includes(number)) {
            score -= 16;
            warnings.push(`team play warning: partner already passed on ${number}`);
          }

          if (weakness.rightOpponent.includes(number) || weakness.leftOpponent.includes(number)) {
            score += 8;
            reasons.push(`team play: this still pressures an opponent on ${number}`);
          }
        }

        if (teamBrain.mode === "blockOpponents") {
          if (rightProfile.weakNumbers.includes(number) || leftProfile.weakNumbers.includes(number)) {
            score += 18;
            reasons.push(`team play: attacks opponent weakness on ${number}`);
          }

          if (rightProfile.strongNumbers.includes(number) || leftProfile.strongNumbers.includes(number)) {
            score -= 12;
            warnings.push(`opponents have shown strength on ${number}`);
          }
        }

        if (teamBrain.mode === "takeOver") {
          if (followUpCount > 0) {
            score += 16;
            reasons.push("takeover mode: keeps you live to finish the hand");
          } else {
            score -= 18;
            warnings.push("takeover warning: this may leave you stuck");
          }

          const remainingDoubles = remainingHand.filter(isDouble);
          remainingDoubles.forEach((doubleTile) => {
            const [doubleNumber] = parseTile(doubleTile);
            const doubleIsStillPlayable = exposed.includes(doubleNumber);
            const doubleSupport = countNumberInTiles(remainingHand, doubleNumber);

            if (!doubleIsStillPlayable && doubleSupport <= 2) {
              score -= doubleTile === "0-0" ? 18 : 12;
              warnings.push(`takeover warning: ${tileLabel(doubleTile)} becomes a dead double risk`);
            }

            if (doubleIsStillPlayable) {
              score += 8;
              reasons.push(`takeover mode: ${tileLabel(doubleTile)} still has an escape path`);
            }
          });
        }
      });

      if (teamBrain.mode === "feedPartner") {
        reasons.push("advisor mode: play for partner");
      } else if (teamBrain.mode === "blockOpponents") {
        reasons.push("advisor mode: block opponents");
      } else if (teamBrain.mode === "takeOver") {
        reasons.push("advisor mode: take over with your hand");
      }

      score = Math.max(0, Math.min(100, Math.round(score)));

      let risk = "Medium";
      if (score >= 78) risk = "Low";
      if (score < 55) risk = "High";

      const capi = estimateCapiChanceForMove({
        move,
        myHand,
        board,
        passLog,
        leftEnd,
        rightEnd,
        playedTiles,
      });

      return {
        ...move,
        newEnds,
        score,
        risk,
        capiChance: capi.chance,
        capiReasons: capi.reasons,
        teamIntentLabel: teamBrain.label,
        teamBrain,
        riskUpgrade,
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

function Tile({ tile, onClick, disabled = false, selected = false, mini = false, displayLeft = null, displayRight = null }) {
  const [a, b] = parseTile(tile);
  const left = displayLeft ?? a;
  const right = displayRight ?? b;

  return (
    <button
      type="button"
      className={`tile ${selected ? "selected" : ""} ${mini ? "mini-tile" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{left}</span>
      <i />
      <span>{right}</span>
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
  const options = FULL_SET.filter((tile) => allowUsed || !usedTiles.has(tile) || tile === value);

  const optionsKey = options.join(",");

  useEffect(() => {
    if (!options.includes(value) && options.length > 0) {
      onChange(options[0]);
    }
  }, [optionsKey, value, onChange]);

  return (
    <label className="field">
      <span>{label}</span>
      <select value={options.includes(value) ? value : options[0] || ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((tile) => (
          <option key={tile} value={tile}>
            {tileLabel(tile)}
          </option>
        ))}
      </select>
    </label>
  );
}

function BoardVisual({ board, leftEnd, rightEnd }) {
  if (!board.length) {
    return (
      <div className="board-empty">
        Board is empty. Select who started and enter the first tile.
      </div>
    );
  }

  const center = board[0];
  const leftPlays = board.filter((play, index) => index > 0 && play.side === "left").reverse();
  const rightPlays = board.filter((play, index) => index > 0 && play.side === "right");

  return (
    <div className="live-table">
      <div className="end-pill">Left end: {leftEnd}</div>

      <div className="domino-line">
        <div className="wing left-wing">
          {leftPlays.map((play) => (
            <div key={play.id} className="board-tile-card">
              <Tile tile={play.tile} displayLeft={play.displayLeft} displayRight={play.displayRight} disabled />
              <small>{getPlayerLabel(play.playerId)}</small>
            </div>
          ))}
        </div>

        <div className="center-tile">
          <Tile tile={center.tile} displayLeft={center.displayLeft} displayRight={center.displayRight} disabled />
          <small>Start: {getPlayerLabel(center.playerId)}</small>
        </div>

        <div className="wing right-wing">
          {rightPlays.map((play) => (
            <div key={play.id} className="board-tile-card">
              <Tile tile={play.tile} displayLeft={play.displayLeft} displayRight={play.displayRight} disabled />
              <small>{getPlayerLabel(play.playerId)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="end-pill">Right end: {rightEnd}</div>
    </div>
  );
}

function PlayerSummary({ player, board, passLog }) {
  const played = board.filter((play) => play.playerId === player.id);
  const passes = passLog.filter((pass) => pass.playerId === player.id);

  return (
    <div className={`summary-card ${player.team}`}>
      <div className="summary-head">
        <h3>{player.label}</h3>
        <span>{played.length} played · {passes.length} passes</span>
      </div>

      <div className="summary-section">
        <strong>Tiles played</strong>
        {played.length ? (
          <div className="summary-tiles">
            {played.map((play) => (
              <Tile key={play.id} tile={play.tile} disabled mini />
            ))}
          </div>
        ) : (
          <p>None yet</p>
        )}
      </div>

      <div className="summary-section">
        <strong>Passed on</strong>
        {passes.length ? (
          <div className="pass-chips">
            {passes.map((pass) => (
              <span key={pass.id}>{pass.leftEnd}/{pass.rightEnd}</span>
            ))}
          </div>
        ) : (
          <p>No passes</p>
        )}
      </div>
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
  const [starterFlipped, setStarterFlipped] = useState(false);

  const [playPlayer, setPlayPlayer] = useState("me");
  const [playTile, setPlayTile] = useState("6-4");
  const [playSide, setPlaySide] = useState("right");

  const [passLog, setPassLog] = useState([]);
  const [closeoutMode, setCloseoutMode] = useState("team");

  const playedTiles = useMemo(() => board.map((play) => play.tile), [board]);

  const usedTiles = useMemo(() => new Set([...myHand, ...playedTiles]), [myHand, playedTiles]);

  const legalSidesForSelected = useMemo(
    () => getLegalSides(playTile, leftEnd, rightEnd),
    [playTile, leftEnd, rightEnd]
  );

  useEffect(() => {
    const playableSides = legalSidesForSelected.filter((side) => side !== "center");

    if (playableSides.length === 1 && playSide !== playableSides[0]) {
      setPlaySide(playableSides[0]);
    }

    if (playableSides.length > 1 && !playableSides.includes(playSide)) {
      setPlaySide(playableSides[0]);
    }
  }, [legalSidesForSelected, playSide]);

  const advisor = useMemo(
    () => analyzeMyMove({ myHand, playedTiles, leftEnd, rightEnd, passLog, board, starter }),
    [myHand, playedTiles, leftEnd, rightEnd, passLog, board, starter]
  );

  const best = advisor.moves[0] || null;
  const backup = advisor.moves[1] || null;
  const avoid = advisor.moves.length > 1 ? advisor.moves[advisor.moves.length - 1] : null;

  const teamRead = useMemo(
    () => getTeamBrain({ board, myHand, passLog, starter, leftEnd, rightEnd }),
    [board, myHand, passLog, starter, leftEnd, rightEnd]
  );

  const winRead = useMemo(
    () =>
      estimateMyHandWinChance({
        myHand,
        board,
        passLog,
        leftEnd,
        rightEnd,
        playedTiles,
        starter,
      }),
    [myHand, board, passLog, leftEnd, rightEnd, playedTiles, starter]
  );

  const teamWinRead = useMemo(
    () =>
      estimateTeamWinChance({
        myHand,
        board,
        passLog,
        leftEnd,
        rightEnd,
        playedTiles,
        starter,
      }),
    [myHand, board, passLog, leftEnd, rightEnd, playedTiles, starter]
  );

  const strategicRead = useMemo(
    () =>
      getStrategicRead({
        myHand,
        board,
        passLog,
        leftEnd,
        rightEnd,
        playedTiles,
        closeoutMode,
      }),
    [myHand, board, passLog, leftEnd, rightEnd, playedTiles, closeoutMode]
  );

  function addTileToHand(tile) {
    if (usedTiles.has(tile)) return;
    setMyHand((current) => [...current, tile]);
  }

  function removeTileFromHand(index) {
    setMyHand((current) => current.filter((_, i) => i !== index));
  }

  function startHand() {
    const nextEnds = getStarterEnds(starterTile, starterFlipped);
    const play = {
      id: Date.now(),
      playerId: starter,
      tile: starterTile,
      displayLeft: nextEnds.leftEnd,
      displayRight: nextEnds.rightEnd,
      side: "center",
      leftEndAfter: nextEnds.leftEnd,
      rightEndAfter: nextEnds.rightEnd,
    };

    setBoard([play]);
    setPassLog([]);
    setLeftEnd(nextEnds.leftEnd);
    setRightEnd(nextEnds.rightEnd);
    setCurrentTurn(getNextPlayerRight(starter).id);

    if (starter === "me") {
      setMyHand((current) => removeOneTile(current, starterTile));
    }

    const next = getNextPlayerRight(starter);
    setPlayPlayer(next.id);
  }

  function applyPlay(playerId, tile, side) {
    const sides = getLegalSides(tile, leftEnd, rightEnd);
    if (!sides.includes(side)) return false;

    const nextEnds = getNewEnds(tile, side, leftEnd, rightEnd);

    const [a, b] = parseTile(tile);
    let displayLeft = a;
    let displayRight = b;

    if (side === "left") {
      displayRight = leftEnd;
      displayLeft = a === leftEnd ? b : a;
    } else if (side === "right") {
      displayLeft = rightEnd;
      displayRight = a === rightEnd ? b : a;
    }

    const play = {
      id: Date.now(),
      playerId,
      tile,
      displayLeft,
      displayRight,
      side,
      leftEndAfter: nextEnds.leftEnd,
      rightEndAfter: nextEnds.rightEnd,
    };

    setBoard((current) => [...current, play]);
    setLeftEnd(nextEnds.leftEnd);
    setRightEnd(nextEnds.rightEnd);

    if (playerId === "me") {
      setMyHand((current) => removeOneTile(current, tile));
    }

    const next = getNextPlayerRight(playerId);
    setCurrentTurn(next.id);
    setPlayPlayer(next.id);

    return true;
  }

  function addPlay() {
    applyPlay(playPlayer, playTile, playSide);
  }

  function playRecommendedMove(move) {
    if (!move) return;
    applyPlay("me", move.tile, move.side);
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

    if (!last) {
      const lastPass = passLog[passLog.length - 1];
      if (!lastPass) return;

      setPassLog((current) => current.slice(0, -1));
      setCurrentTurn(lastPass.playerId);
      setPlayPlayer(lastPass.playerId);
      return;
    }

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
    setStarterFlipped(false);
    setPlayPlayer("me");
    setPlayTile("6-4");
    setPlaySide("right");
    setPassLog([]);
    setCloseoutMode("team");
  }

  const starterPreview = getStarterEnds(starterTile, starterFlipped);

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Simple Live Domino Advisor</p>
          <h1>Track the board live. Get your best move.</h1>
          <p>
            Add your hand, start the board, then enter each tile as it is played.
            Your hand removes tiles automatically, the board updates, and every player gets a summary.
          </p>
        </div>
        <button className="ghost danger" type="button" onClick={resetEverything}>
          Reset
        </button>
      </section>

      <section className="panel hand-panel">
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

          <div className="starter-orientation">
            <div>
              <span>Starter orientation</span>
              <strong>{starterPreview.leftEnd}|{starterPreview.rightEnd}</strong>
              <small>Left end will be {starterPreview.leftEnd}, right end will be {starterPreview.rightEnd}</small>
            </div>
            <button className="ghost" type="button" onClick={() => setStarterFlipped((value) => !value)}>
              Flip Starter Tile
            </button>
          </div>

          <button className="primary full-btn" type="button" onClick={startHand}>
            Start / Restart Board With This Tile
          </button>

          <div className="note">
            First hand rule: use <strong>6|6</strong>. For non-doubles like 6|2, use <strong>Flip Starter Tile</strong> if the board has it the other way.
          </div>
        </section>

        <section className="panel">
          <p className="step">Step 3</p>
          <h2>Add each play live</h2>

          <div className="turn-banner">
            Current turn: <strong>{getPlayerLabel(currentTurn)}</strong>
            <span>Next after this always moves right.</span>
          </div>

          <div className="form-grid add-play-grid">
            <PlayerSelect value={playPlayer} onChange={setPlayPlayer} label="Who played?" />
            <TileSelect value={playTile} onChange={setPlayTile} usedTiles={usedTiles} allowUsed={playPlayer === "me"} label="Tile played" />
            <label className="field">
              <span>Side</span>
              <select
                value={playSide}
                onChange={(e) => setPlaySide(e.target.value)}
                disabled={legalSidesForSelected.filter((side) => side !== "center").length <= 1}
              >
                {legalSidesForSelected.includes("left") && <option value="left">Left side</option>}
                {legalSidesForSelected.includes("right") && <option value="right">Right side</option>}
              </select>
              <small className="field-help">
                {legalSidesForSelected.filter((side) => side !== "center").length <= 1
                  ? "Auto-selected because this tile only fits one side."
                  : "This tile fits both sides — choose one."}
              </small>
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
        <BoardVisual board={board} leftEnd={leftEnd} rightEnd={rightEnd} />
      </section>



      <section className="panel win-chance-panel">
        <div className="section-head">
          <div>
            <p className="step">Live win chance</p>
            <h2>My hand win chance</h2>
          </div>
          <div className="dual-win-badges">
            <div className="win-badge">
              <strong>{winRead.chance}%</strong>
              <span>My hand · {winRead.label}</span>
            </div>
            <div className="win-badge team">
              <strong>{teamWinRead.chance}%</strong>
              <span>Team · {teamWinRead.label}</span>
              <small>{teamWinRead.confidence} confidence</small>
            </div>
          </div>
        </div>

        <div className="meter-label">My hand win estimate</div>
        <div className="win-meter">
          <div style={{ width: `${winRead.chance}%` }} />
        </div>

        <div className="meter-label">Team win estimate</div>
        <div className="win-meter team-meter">
          <div style={{ width: `${teamWinRead.chance}%` }} />
        </div>

        <p className="accuracy-note">
          These percentages are live estimates, not guarantees. They become more useful as you enter more plays and passes.
          The app caps the percentage based on confidence so it should no longer show fake 100% certainty early.
        </p>

        <div className="win-stats">
          <div>
            <span>Playable tiles</span>
            <strong>{winRead.details.playableCount}</strong>
          </div>
          <div>
            <span>My pips</span>
            <strong>{winRead.details.myPips}</strong>
          </div>
          <div>
            <span>Flexibility</span>
            <strong>{winRead.details.flexibility}/100</strong>
          </div>
          <div>
            <span>Phase</span>
            <strong>{winRead.details.phase}</strong>
          </div>
        </div>

        <div className="win-reasons">
          {winRead.reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>

        <div className="team-win-read">
          <h3>Team read</h3>
          <div className="win-reasons">
            {teamWinRead.reasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel team-brain-panel">
        <div className="section-head">
          <div>
            <p className="step">Team Brain</p>
            <h2>{teamRead.label}</h2>
          </div>
          <div className="team-strength">
            Hand strength: <strong>{teamRead.myStrength.score}/100</strong>
          </div>
        </div>

        <div className="team-grid">
          <div>
            <span>Me</span>
            <strong>{teamRead.myTilesLeft}</strong>
            <small>tiles left</small>
          </div>
          <div>
            <span>Partner</span>
            <strong>{teamRead.partnerTilesLeft}</strong>
            <small>estimated tiles left</small>
          </div>
          <div>
            <span>Right Opp</span>
            <strong>{teamRead.rightOpponentTilesLeft}</strong>
            <small>estimated tiles left</small>
          </div>
          <div>
            <span>Left Opp</span>
            <strong>{teamRead.leftOpponentTilesLeft}</strong>
            <small>estimated tiles left</small>
          </div>
        </div>

        <div className="team-reasons">
          {(teamRead.reasons.length ? teamRead.reasons : ["no major team pressure yet"]).map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
          {teamRead.myStrength.reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      </section>

      <section className="panel result-panel">
        <p className="step">Advisor</p>
        <h2>Best move for me</h2>

        {currentTurn !== "me" && (
          <div className="notice">
            It is currently <strong>{getPlayerLabel(currentTurn)}</strong>'s turn.
            Keep entering plays until it gets back to you.
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
                <p>
                  Capi chance after this move: <strong>{best.capiChance || 0}%</strong>
                </p>
                <p>
                  Advisor mode: <strong>{best.teamIntentLabel || teamRead.label}</strong>
                </p>
                <p>
                  Phase: <strong>{best.riskUpgrade?.phase}</strong> · Tiles out: <strong>{best.riskUpgrade?.tilesRemaining}</strong> · Flex after: <strong>{best.riskUpgrade?.afterFlex}/100</strong>
                </p>
              </div>
              <div className={`score ${best.risk.toLowerCase()}`}>
                {best.score}/100
                <small>{best.risk} risk</small>
              </div>
            </div>

            <button className="primary full-btn" type="button" onClick={() => playRecommendedMove(best)}>
              Play Recommended Move For Me
            </button>

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
                    <em>{move.score}/100 · Capi {move.capiChance || 0}%</em>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </section>



      {best?.riskUpgrade && (
        <section className="panel risk-engine-panel">
          <p className="step">Risk Engine</p>
          <h2>Double risk / flexibility read</h2>

          <div className="risk-grid">
            <div>
              <span>Game phase</span>
              <strong>{best.riskUpgrade.phase}</strong>
            </div>
            <div>
              <span>Tiles still out</span>
              <strong>{best.riskUpgrade.tilesRemaining}</strong>
            </div>
            <div>
              <span>Future flexibility</span>
              <strong>{best.riskUpgrade.afterFlex}/100</strong>
            </div>
            <div>
              <span>Dead double penalty</span>
              <strong>{best.riskUpgrade.doubleRisk.penalty}</strong>
            </div>
          </div>

          {best.riskUpgrade.warnings.length > 0 && (
            <div className="risk-warnings">
              {best.riskUpgrade.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="panel odds-panel">
        <div className="section-head">
          <div>
            <p className="step">Strategy read</p>
            <h2>Win chance / Capi / Closeout odds</h2>
          </div>

          <label className="field mode-field">
            <span>Closeout rule</span>
            <select value={closeoutMode} onChange={(e) => setCloseoutMode(e.target.value)}>
              <option value="team">Team closeout: my team must have less than their team</option>
              <option value="individual">Individual closeout: I must have less than player to my right</option>
            </select>
          </label>
        </div>

        <div className="odds-grid">
          <div className="odds-card">
            <span>Best move capi chance</span>
            <strong>{best ? `${best.capiChance || 0}%` : "0%"}</strong>
            <p>
              {best && best.capiReasons?.length
                ? best.capiReasons.join(" · ")
                : "No capi setup found yet."}
            </p>
          </div>

          <div className="odds-card">
            <span>0|0 +100 finish chance</span>
            <strong>{strategicRead.zeroZero.chance}%</strong>
            <p>{strategicRead.zeroZero.reasons.join(" · ")}</p>
          </div>

          <div className="odds-card">
            <span>Closeout win chance</span>
            <strong>{strategicRead.closeout.chance}%</strong>
            <p>{strategicRead.closeout.reasons.join(" · ")}</p>
          </div>
        </div>

        <div className="read-grid">
          {strategicRead.profiles.map((item) => (
            <div key={item.id} className={`read-card ${item.team}`}>
              <h3>{item.label}</h3>
              <p>Chance they can answer current ends: <strong>{item.playChance}%</strong></p>
              <p>
                Strong numbers:{" "}
                <strong>
                  {item.profile.strongNumbers.length ? item.profile.strongNumbers.join(", ") : "none seen"}
                </strong>
              </p>
              <p>
                Passed/weak numbers:{" "}
                <strong>
                  {item.profile.weakNumbers.length ? item.profile.weakNumbers.join(", ") : "none"}
                </strong>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="step">Live summary</p>
        <h2>What everyone played / passed on</h2>
        <div className="summary-grid">
          {PLAYERS_RIGHT_ORDER.map((player) => (
            <PlayerSummary key={player.id} player={player} board={board} passLog={passLog} />
          ))}
        </div>
      </section>
    </main>
  );
}
