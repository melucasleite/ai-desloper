import {
  type Detector,
  type DetectorResult,
  boxesOf,
  byY,
  emojiList,
  finding,
  fmt,
  pageText,
  plural,
  quote,
  status,
  words,
} from "./util";

const ROCKETS = new Set(["🚀"]);
const SPARKLES = new Set(["✨", "💫", "🌟", "⭐"]);
const CHECK_START_RE = /^\s*[✓✔✅☑🗸]/u;
const EMOJI_START_RE = /^\s*\p{Extended_Pictographic}/u;

export const detectMarkers: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const text = pageText(capture);
  const wc = Math.max(1, words(text).length);
  const blocks = byY(
    capture.mobile.blocks.length
      ? capture.mobile.blocks
      : capture.desktop.blocks,
  );

  // Emoji.
  const emoji = emojiList(text);
  const rockets = emoji.filter((e) => ROCKETS.has(e)).length;
  const sparkles = emoji.filter((e) => SPARKLES.has(e)).length;
  if (emoji.length) {
    const tally =
      rockets >= sparkles && rockets > 0
        ? `, ${rockets} of them rockets`
        : sparkles
          ? `, ${sparkles} of them sparkles`
          : "";
    out.statuses.push(
      status(`Found ${plural(emoji.length, "emoji", "emoji")}${tally}`),
    );
  } else {
    out.statuses.push(status("Zero emoji. Refreshing."));
  }

  const headingEmoji = blocks.filter(
    (b) => /^h[1-6]$/i.test(b.tag) && emojiList(b.text).length > 0,
  );
  if (headingEmoji.length) {
    out.findings.push(
      finding({
        id: "emoji-headings",
        tenet: "markers",
        severity: headingEmoji.length >= 3 ? "high" : "medium",
        title: `Emoji in ${plural(headingEmoji.length, "heading")}`,
        detail:
          "Emoji in headings are the fingerprint of generated copy and undercut every claim next to them.",
        evidence: headingEmoji.map((b) => quote(b.text, 80)),
        boxes: boxesOf(headingEmoji),
        weight: 0.5,
      }),
    );
  }

  const emojiBullets = blocks.filter(
    (b) =>
      !/^h[1-6]$/i.test(b.tag) &&
      EMOJI_START_RE.test(b.text) &&
      !CHECK_START_RE.test(b.text),
  );
  if (emojiBullets.length >= 2) {
    out.findings.push(
      finding({
        id: "emoji-bullets",
        tenet: "markers",
        severity: emojiBullets.length >= 4 ? "high" : "medium",
        title: `${plural(emojiBullets.length, "line")} led by an emoji`,
        detail:
          "Emoji used as bullet points read as filler and make every item look equally unimportant.",
        evidence: emojiBullets.map((b) => quote(b.text, 80)),
        boxes: boxesOf(emojiBullets),
        weight: 0.4,
      }),
    );
  }

  const hype = rockets + sparkles;
  if (hype >= 3 || (emoji.length >= 8 && emoji.length / wc > 0.01)) {
    const hypeBlocks = blocks.filter((b) =>
      emojiList(b.text).some((e) => ROCKETS.has(e) || SPARKLES.has(e)),
    );
    out.findings.push(
      finding({
        id: "emoji-density",
        tenet: "markers",
        severity: hype >= 6 || emoji.length >= 15 ? "high" : "medium",
        title: `${plural(emoji.length, "emoji", "emoji")}, ${rockets} rockets, ${sparkles} sparkles`,
        detail:
          "Rockets and sparkles signal excitement the copy hasn't earned.",
        evidence: [`${emoji.length} emoji in ${wc} words`],
        boxes: boxesOf(hypeBlocks),
        weight: 0.45,
      }),
    );
  }

  // Em dashes.
  const dashes = (text.match(/—/g) ?? []).length;
  const perThousand = (dashes / wc) * 1000;
  if (dashes >= 3 && perThousand >= 4) {
    const dashBlocks = blocks.filter((b) => b.text.includes("—"));
    out.findings.push(
      finding({
        id: "em-dash-rate",
        tenet: "markers",
        severity: perThousand >= 10 ? "medium" : "low",
        title: `${plural(dashes, "em dash", "em dashes")}`,
        detail:
          "A heavy em-dash habit is one of the most reliable tells of generated copy.",
        evidence: dashBlocks.slice(0, 3).map((b) => quote(b.text, 90)),
        boxes: boxesOf(dashBlocks),
        weight: 0.3,
      }),
    );
    out.statuses.push(
      status(
        `${plural(dashes, "em dash", "em dashes")}, about ${fmt(perThousand, 0)} per thousand words`,
        dashBlocks[0]?.box,
      ),
    );
  }

  // Checkmark lists.
  const checks = blocks.filter((b) => CHECK_START_RE.test(b.text));
  if (checks.length >= 4) {
    out.findings.push(
      finding({
        id: "checkmark-lists",
        tenet: "markers",
        severity: checks.length >= 6 ? "medium" : "low",
        title: `${checks.length} checkmark bullets`,
        detail:
          "Lists of ticked benefits are skimmed as a single blur; one proven claim beats six checkmarks.",
        evidence: checks.map((b) => quote(b.text, 60)),
        boxes: boxesOf(checks),
        weight: 0.3,
      }),
    );
  }

  return out;
};
