import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "zijie1024";
const TOKEN = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  throw new Error("Missing PROFILE_TOKEN or GITHUB_TOKEN");
}

const QUERY = `
query($username:String!){
  user(login:$username){
    contributionsCollection{
      startedAt
      endedAt
      contributionCalendar{
        totalContributions
        months{
          name
          firstDay
          totalWeeks
          year
        }
        weeks{
          firstDay
          contributionDays{
            date
            contributionCount
            contributionLevel
            weekday
          }
        }
      }
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": `${USERNAME}-profile`,
    "X-GitHub-Api-Version": "2022-11-28"
  },
  body: JSON.stringify({
    query: QUERY,
    variables: { username: USERNAME }
  })
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed: ${response.status} ${await response.text()}`);
}

const result = await response.json();

if (result.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${JSON.stringify(result.errors, null, 2)}`);
}

if (!result.data?.user) {
  throw new Error(`GitHub user not found: ${USERNAME}`);
}

const collection = result.data.user.contributionsCollection;
const calendar = collection.contributionCalendar;

const THEMES = {
  light: {
    background: "#ffffff",
    border: "#d0d7de",
    text: "#1f2328",
    muted: "#656d76",
    prompt: "#1a7f37",
    levels: {
      NONE: "#ebedf0",
      FIRST_QUARTILE: "#9be9a8",
      SECOND_QUARTILE: "#40c463",
      THIRD_QUARTILE: "#30a14e",
      FOURTH_QUARTILE: "#216e39"
    }
  },
  dark: {
    background: "#0f141b",
    border: "#26313d",
    text: "#f0f6fc",
    muted: "#7d8b99",
    prompt: "#7ee787",
    levels: {
      NONE: "#161b22",
      FIRST_QUARTILE: "#1f4229",
      SECOND_QUARTILE: "#2f6b3c",
      THIRD_QUARTILE: "#46a758",
      FOURTH_QUARTILE: "#7ee787"
    }
  }
};

const escapeXml = value =>
  String(value).replace(/[<>&"']/g, char => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  }[char]));

const parseDate = value => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatMonthYear = value =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));

const dayDiff = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);

function render(themeName) {
  const theme = THEMES[themeName];
  const weeks = calendar.weeks;

  const width = 1200;
  const height = 220;

  const cardX = 1;
  const cardY = 38;
  const cardWidth = 1198;
  const cardHeight = 181;

  const gridX = 72;
  const gridY = 92;

  const cell = 14;
  const gap = 4;
  const step = cell + gap;

  const firstWeekDate = weeks[0]?.firstDay;

  const period = `${formatMonthYear(collection.startedAt)} → ${formatMonthYear(collection.endedAt)}`;

  const out = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`
  );
  out.push(`<title id="title">${escapeXml(USERNAME)} GitHub Contributions</title>`);
  out.push(`<desc id="desc">${calendar.totalContributions} contributions in the last year</desc>`);
  out.push(`<defs><style>`);
  out.push(`.t{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}`);
  out.push(`.p{fill:${theme.prompt};font-size:15px}`);
  out.push(`.c{fill:${theme.text};font-size:15px}`);
  out.push(`.m{fill:${theme.muted};font-size:10px}`);
  out.push(`.s{fill:${theme.text};font-size:12px}`);
  out.push(`</style></defs>`);

  out.push(`<text x="12" y="20" class="t p">${escapeXml(USERNAME)}@github:~$</text>`);
  out.push(`<text x="190" y="20" class="t c">git contributions --since=&quot;1 year ago&quot;</text>`);

  out.push(
    `<rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="13" fill="${theme.background}" stroke="${theme.border}"/>`
  );

  out.push(`<text x="28" y="66" class="t s">${calendar.totalContributions} contributions in the last year</text>`);
  out.push(`<text x="1170" y="66" text-anchor="end" class="t m">${escapeXml(period)}</text>`);

  const usedMonthColumns = new Set();

  for (const month of calendar.months) {
    if (!firstWeekDate) continue;
    const diff = dayDiff(month.firstDay, firstWeekDate);
    const weekIndex = Math.max(0, Math.floor(diff / 7));
    if (weekIndex >= weeks.length || usedMonthColumns.has(weekIndex)) continue;
    usedMonthColumns.add(weekIndex);
    out.push(
      `<text x="${gridX + weekIndex * step}" y="82" class="t m">${escapeXml(month.name.slice(0, 3))}</text>`
    );
  }

  const weekdayLabels = [
    ["Mon", 1],
    ["Wed", 3],
    ["Fri", 5]
  ];

  for (const [label, row] of weekdayLabels) {
    out.push(`<text x="28" y="${gridY + row * step + 10}" class="t m">${label}</text>`);
  }

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach(day => {
      const x = gridX + weekIndex * step;
      const y = gridY + day.weekday * step;
      const color = theme.levels[day.contributionLevel] || theme.levels.NONE;
      const countText = `${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}`;
      out.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${color}"><title>${escapeXml(day.date)}: ${countText}</title></rect>`
      );
    });
  });

  const levels = [
    "NONE",
    "FIRST_QUARTILE",
    "SECOND_QUARTILE",
    "THIRD_QUARTILE",
    "FOURTH_QUARTILE"
  ];

  const legendY = 205;
  const legendBoxSize = 12;
  const legendBoxGap = 5;
  const legendTextGap = 8;

  const lessWidth = 26;
  const moreWidth = 30;
  const boxesWidth = levels.length * legendBoxSize + (levels.length - 1) * legendBoxGap;
  const legendWidth = lessWidth + legendTextGap + boxesWidth + legendTextGap + moreWidth;
  const legendStart = width - 28 - legendWidth;
  const legendBoxesStart = legendStart + lessWidth + legendTextGap;

  out.push(`<text x="${legendStart}" y="${legendY}" class="t m">Less</text>`);

  levels.forEach((level, index) => {
    out.push(
      `<rect x="${legendBoxesStart + index * (legendBoxSize + legendBoxGap)}" y="${legendY - 10}" width="${legendBoxSize}" height="${legendBoxSize}" rx="2" fill="${theme.levels[level]}"/>`
    );
  });

  out.push(`<text x="${legendBoxesStart + boxesWidth + legendTextGap}" y="${legendY}" class="t m">More</text>`);

  out.push(`</svg>`);

  return out.join("");
}

const assetsDir = path.resolve("assets");
fs.mkdirSync(assetsDir, { recursive: true });

for (const themeName of Object.keys(THEMES)) {
  const output = path.join(assetsDir, `contributions-${themeName}.svg`);
  fs.writeFileSync(output, render(themeName), "utf8");
  console.log(`Generated ${output}`);
}

console.log(`Done: ${calendar.totalContributions} contributions for ${USERNAME}`);
