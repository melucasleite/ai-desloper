import {
  type Detector,
  type DetectorResult,
  distinctCtaLabels,
  finding,
  humanList,
  pageText,
  plural,
  quote,
  status,
} from "./util";

export const GENERIC_CTA_RE =
  /^(get started( now| today| for free| free| in minutes)?|learn more|read more|find out more|discover more|explore( more| now)?|sign up( now| today| free| for free)?|try (it )?(now|free|for free|today)|try (it|us) free|start (now|today|free|for free|free trial|your free trial|your journey|building)|start free trial|click here|submit|(book|request|schedule|get) a demo|join( now| today| the waitlist| waitlist)?|get it now|get access|let'?s go)$/;

const CONTACT_TEXT_RE =
  /(contact|e-?mail (us|me)|talk to (a human|us|sales|someone|me|the team)|get in touch|say hi|say hello|write to|call us|reach (us|out))/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;

const MAX_LABELS = 3;

export const detectAction: Detector = (capture) => {
  const out: DetectorResult = { findings: [], statuses: [] };
  const labels = distinctCtaLabels(capture);
  const names = [...labels.keys()];
  const shown = (n: string) => `"${quote(labels.get(n)?.[0]?.text ?? n, 40)}"`;

  if (names.length) {
    out.statuses.push(
      status(
        names.length > MAX_LABELS
          ? `${plural(names.length, "different button label")}: ${humanList(names.slice(0, 4).map(shown))}${names.length > 4 ? "…" : ""}`
          : `Buttons say ${humanList(names.map(shown))}`,
        labels.get(names[0]!)?.[0]?.box,
      ),
    );
  }

  if (names.length > MAX_LABELS) {
    const all = names.flatMap((n) => labels.get(n) ?? []);
    out.findings.push(
      finding({
        id: "competing-ctas",
        tenet: "action",
        severity: names.length >= 6 ? "high" : "medium",
        title: `${names.length} competing calls to action`,
        detail:
          "Every new button label is another decision; one action, repeated, converts better than a menu of them.",
        evidence: names.map((n) => quote(labels.get(n)?.[0]?.text ?? n, 50)),
        boxes: all.map((l) => l.box),
        weight: 0.45,
      }),
    );
  }

  const generic = names.filter((n) => GENERIC_CTA_RE.test(n));
  if (generic.length) {
    const links = generic.flatMap((n) => labels.get(n) ?? []);
    out.findings.push(
      finding({
        id: "generic-cta-label",
        tenet: "action",
        severity:
          generic.length >= 2 || generic.length === names.length
            ? "high"
            : "medium",
        title: "Buttons say nothing about what you get",
        detail: `${humanList(generic.map(shown))} could sit on any site; a label should name the outcome, like "See your score".`,
        evidence: generic.map((n) => quote(labels.get(n)?.[0]?.text ?? n, 50)),
        boxes: links.map((l) => l.box),
        weight: 0.55,
      }),
    );
    out.statuses.push(
      status(
        `${shown(generic[0]!)} spotted. That button could belong to any site on earth`,
        links[0]?.box,
      ),
    );
  }

  const allLinks = [...capture.desktop.links, ...capture.mobile.links];
  const contact = allLinks.find(
    (l) =>
      /^(mailto:|tel:)/i.test(l.href) ||
      /\/contact\b/i.test(l.href) ||
      CONTACT_TEXT_RE.test(l.text),
  );
  const emailInText = EMAIL_RE.test(pageText(capture));
  if (!contact && !emailInText) {
    out.findings.push(
      finding({
        id: "no-contact-path",
        tenet: "action",
        severity: "medium",
        title: "No way to reach a human",
        detail:
          "There's no email, form or phone number, so anyone with a real question has to guess or leave.",
        weight: 0.35,
      }),
    );
    out.statuses.push(
      status("No email, contact form or phone number anywhere"),
    );
  } else if (contact) {
    out.statuses.push(
      status(
        `Contact path found: "${quote(contact.text || contact.href, 40)}"`,
        contact.box,
      ),
    );
  }

  return out;
};
