const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";

const listingsPath = path.join(__dirname, ".github", "scripts", "listings.json");
const statusPath = path.join(__dirname, "data", "status.json");
const noSponsorship = "Does Not Offer Sponsorship";

app.use(express.json());
app.use(express.static(path.join(__dirname, "static")));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeStatus(statuses) {
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, `${JSON.stringify(statuses, null, 2)}\n`);
}

function getStatuses() {
  return readJson(statusPath, []);
}

function syncSponsorshipStatuses(listings, statuses) {
  const existingIds = new Set(statuses.map((status) => status.id));
  const missingNoSponsorship = listings
    .filter((listing) => listing.sponsorship === noSponsorship && !existingIds.has(listing.id))
    .map((listing) => ({ id: listing.id, applied: false, not_applicable: true }));

  if (!missingNoSponsorship.length) return statuses;

  const nextStatuses = statuses.concat(missingNoSponsorship);
  writeStatus(nextStatuses);
  return nextStatuses;
}

app.get("/api/listings", (req, res, next) => {
  try {
    const rawListings = readJson(listingsPath, []);
    const statuses = new Map(syncSponsorshipStatuses(rawListings, getStatuses()).map((status) => [status.id, status]));
    const listings = rawListings.map((listing) => {
      const saved = statuses.get(listing.id) || {};
      return {
        id: listing.id,
        company: listing.company_name || "",
        role: listing.title || "",
        location: Array.isArray(listing.locations) ? listing.locations.join(", ") : listing.locations || "",
        link: listing.url || "",
        date_posted: listing.date_posted || 0,
        closed: listing.active === false,
        applied: Boolean(saved.applied),
        not_applicable: Boolean(saved.not_applicable),
      };
    });

    res.json(listings);
  } catch (error) {
    next(error);
  }
});

app.put("/api/status/:id", (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = readJson(listingsPath, []).find((item) => item.id === id);
    const applied = Boolean(req.body.applied);
    const notApplicable = applied ? false : Boolean(req.body.not_applicable);
    const statuses = getStatuses().filter((status) => status.id !== id);

    if (applied || notApplicable || (listing && listing.sponsorship === noSponsorship)) {
      statuses.push({ id, applied, not_applicable: notApplicable });
    }

    writeStatus(statuses);
    res.json({ id, applied, not_applicable: notApplicable });
  } catch (error) {
    next(error);
  }
});

const server = app.listen(port, host, () => {
  console.log(`Listening on http://${host}:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
