import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "zijie1024";
const TOKEN = process.env.PROFILE_TOKEN;

if (!TOKEN) {
  throw new Error(
    "Missing PROFILE_TOKEN. A personal access token is required to read the authenticated user's contribution data."
  );
}

const QUERY = `
query {
  viewer {
    login
    contributionsCollection {
      startedAt
      endedAt
      hasAnyContributions
      hasAnyRestrictedContributions
      restrictedContributionsCount
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        months {
          name
          firstDay
          totalWeeks
          year
        }
        weeks {
          firstDay
          contributionDays {
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
    query: QUERY
  })
});

if (!response.ok) {
  throw new Error(
    `GitHub GraphQL request failed: ${response.status} ${await response.text()}`
  );
}

const result = await response.json();

if (result.errors?.length) {
  throw new Error(
    `GitHub GraphQL error: ${JSON.stringify(result.errors, null, 2)}`
  );
}

const viewer = result.data?.viewer;

if (!viewer) {
  throw new Error("GitHub GraphQL did not return viewer information");
}

if (viewer.login.toLowerCase() !== USERNAME.toLowerCase()) {
  throw new Error(
    `PROFILE_TOKEN belongs to "${viewer.login}", but GITHUB_USERNAME is "${USERNAME}"`
  );
}

const collection = viewer.contributionsCollection;
const calendar = collection.contributionCalendar;

console.log(`Authenticated as: ${viewer.login}`);
console.log(`Contribution period: ${collection.startedAt} -> ${collection.endedAt}`);
console.log(`Total contributions: ${calendar.totalContributions}`);
console.log(`Commit contributions: ${collection.totalCommitContributions}`);
console.log(`Pull request contributions: ${collection.totalPullRequestContributions}`);
console.log(`Pull request review contributions: ${collection.totalPullRequestReviewContributions}`);
console.log(`Issue contributions: ${collection.totalIssueContributions}`);
console.log(`Repository contributions: ${collection.totalRepositoryContributions}`);
console.log(`Restricted contributions: ${collection.restrictedContributionsCount}`);
console.log(`Has restricted contributions: ${collection.hasAnyRestrictedContributions}`);

if (!collection.hasAnyContributions) {
  console.warn(
    "WARNING: GitHub reports no contributions for this account in the current contribution period."
  );
}

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

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, char => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;"
  })[char]);
}

function formatMonthYear(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function getMonthWeekIndex(month, weeks) {
  const exactIndex = weeks.findIndex(week =>
    week.contributionDays.some(day => day.date === month.firstDay)
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const prefix = month.firstDay.slice(0, 7);

  return weeks.findIndex(week =>
    week.contributionDays.some(day => day.date.startsWith(prefix))
  );
}

function render(themeName) {
  const theme = THEMES[themeName];
  const weeks = calendar.weeks;

  if (!weeks.length) {
    throw new Error("GitHub returned an empty contribution calendar");
  }

  const width = 1200;
  const height = 244;

  const cardX = 1;
  const cardY = 38;
  const cardWidth = 1198;
  const cardHeight = 205;

  const gridX = 72;
  const gridRight = 1170;
  const gridWidth = gridRight - gridX;

  const columnGap = 4;
  const cell =
    (gridWidth - columnGap * (weeks.length - 1)) /
    weeks.length;

  const columnStep = cell + columnGap;

  const gridY = 94;
  const rowGap = 4;
  const rowStep = cell + rowGap;

  const summaryY = 66;
  const monthY = 84;

  const period =
    `${formatMonthYear(collection.startedAt)} → ` +
    `${formatMonthYear(collection.endedAt)}`;

  const output = [];

  output.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-labelledby="title desc">`
  );

  output.push(
    `<title id="title">${escapeXml(USERNAME)} GitHub Contributions</title>`
  );

  output.push(
    `<desc id="desc">` +
    `${calendar.totalContributions} contributions in the last year` +
    `</desc>`
  );

  output.push(`<defs>`);
  output.push(`<style>`);

  output.push(
    `.t{` +
    `font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,` +
    `"Liberation Mono","Courier New",monospace` +
    `}`
  );

  output.push(`.prompt{fill:${theme.prompt};font-size:15px}`);
  output.push(`.command{fill:${theme.text};font-size:15px}`);
  output.push(`.summary{fill:${theme.text};font-size:12px}`);
  output.push(`.muted{fill:${theme.muted};font-size:10px}`);

  output.push(`</style>`);
  output.push(`</defs>`);

  // Terminal command
  output.push(
    `<text x="12" y="20" class="t prompt">` +
    `${escapeXml(USERNAME)}@github:~$` +
    `</text>`
  );

  output.push(
    `<text x="190" y="20" class="t command">` +
    `git contributions --since=&quot;1 year ago&quot;` +
    `</text>`
  );

  // Card
  output.push(
    `<rect ` +
    `x="${cardX}" ` +
    `y="${cardY}" ` +
    `width="${cardWidth}" ` +
    `height="${cardHeight}" ` +
    `rx="13" ` +
    `fill="${theme.background}" ` +
    `stroke="${theme.border}"` +
    `/>`
  );

  // Total contributions
  output.push(
    `<text x="28" y="${summaryY}" class="t summary">` +
    `${calendar.totalContributions} contributions in the last year` +
    `</text>`
  );

  // Legend on first row
  const levels = [
    "NONE",
    "FIRST_QUARTILE",
    "SECOND_QUARTILE",
    "THIRD_QUARTILE",
    "FOURTH_QUARTILE"
  ];

  const legendBoxSize = 11;
  const legendBoxGap = 4;
  const legendStartX = 780;
  const legendY = summaryY;

  output.push(
    `<text ` +
    `x="${legendStartX}" ` +
    `y="${legendY}" ` +
    `class="t muted">Less</text>`
  );

  const legendBoxesStartX = legendStartX + 31;

  levels.forEach((level, index) => {
    output.push(
      `<rect ` +
      `x="${legendBoxesStartX + index * (legendBoxSize + legendBoxGap)}" ` +
      `y="${legendY - 10}" ` +
      `width="${legendBoxSize}" ` +
      `height="${legendBoxSize}" ` +
      `rx="2" ` +
      `fill="${theme.levels[level]}"` +
      `/>`
    );
  });

  const legendBoxesWidth =
    levels.length * legendBoxSize +
    (levels.length - 1) * legendBoxGap;

  output.push(
    `<text ` +
    `x="${legendBoxesStartX + legendBoxesWidth + 8}" ` +
    `y="${legendY}" ` +
    `class="t muted">More</text>`
  );

  // Date range
  output.push(
    `<text ` +
    `x="${gridRight}" ` +
    `y="${summaryY}" ` +
    `text-anchor="end" ` +
    `class="t muted">` +
    `${escapeXml(period)}` +
    `</text>`
  );

  // Month labels
  const usedMonthColumns = new Set();

  for (const month of calendar.months) {
    const weekIndex = getMonthWeekIndex(month, weeks);

    if (weekIndex < 0 || weekIndex >= weeks.length) {
      continue;
    }

    if (usedMonthColumns.has(weekIndex)) {
      continue;
    }

    usedMonthColumns.add(weekIndex);

    const x = gridX + weekIndex * columnStep;

    output.push(
      `<text ` +
      `x="${x.toFixed(2)}" ` +
      `y="${monthY}" ` +
      `class="t muted">` +
      `${escapeXml(month.name.slice(0, 3))}` +
      `</text>`
    );
  }

  // Weekday labels
  const weekdayLabels = [
    ["Mon", 1],
    ["Wed", 3],
    ["Fri", 5]
  ];

  for (const [label, weekday] of weekdayLabels) {
    const y =
      gridY +
      weekday * rowStep +
      cell * 0.73;

    output.push(
      `<text ` +
      `x="28" ` +
      `y="${y.toFixed(2)}" ` +
      `class="t muted">` +
      `${label}` +
      `</text>`
    );
  }

  // Contribution cells
  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach(day => {
      const x =
        gridX +
        weekIndex * columnStep;

      const y =
        gridY +
        day.weekday * rowStep;

      const color =
        theme.levels[day.contributionLevel] ||
        theme.levels.NONE;

      const countText =
        `${day.contributionCount} contribution` +
        `${day.contributionCount === 1 ? "" : "s"}`;

      output.push(
        `<rect ` +
        `x="${x.toFixed(2)}" ` +
        `y="${y.toFixed(2)}" ` +
        `width="${cell.toFixed(2)}" ` +
        `height="${cell.toFixed(2)}" ` +
        `rx="2.5" ` +
        `fill="${color}">` +
        `<title>` +
        `${escapeXml(day.date)}: ${escapeXml(countText)}` +
        `</title>` +
        `</rect>`
      );
    });
  });

  output.push(`</svg>`);

  return output.join("");
}

const assetsDir = path.resolve("assets");

fs.mkdirSync(assetsDir, {
  recursive: true
});

for (const themeName of Object.keys(THEMES)) {
  const outputPath = path.join(
    assetsDir,
    `contributions-${themeName}.svg`
  );

  fs.writeFileSync(
    outputPath,
    render(themeName),
    "utf8"
  );

  console.log(`Generated ${outputPath}`);
}

console.log(
  `Generated contribution graph for ${USERNAME}: ` +
  `${calendar.totalContributions} contributions`
);
