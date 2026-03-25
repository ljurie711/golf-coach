// generate-coach-data.js
// Run this script once to create coach-data.json for Azure Blob Storage
//
// Instructions:
// 1. Run each SQL query in Azure Query Editor separately
// 2. For each result click "Download as CSV" or copy tab-separated results
// 3. Save them in the same folder as this script:
//      alltime.txt      → SELECT * FROM golf.vw_AllTimeSummary ORDER BY ideal_carry_distance DESC
//      lastsession.txt  → SELECT * FROM golf.vw_LastSessionSummary ORDER BY avg_carry DESC
//      shots.txt        → The full shot-level query below
//
// Shot-level query to run in Azure Query Editor:
// SELECT
//     s.shot_id, s.session_id, se.session_date, c.club_name, c.brand_model,
//     s.recorded_at, s.carry_distance_yds, s.total_distance_yds,
//     s.ball_speed_mph, s.club_speed_mph, s.smash_factor,
//     s.launch_angle_deg, s.launch_direction_deg, s.attack_angle_deg,
//     s.club_path_deg, s.club_face_deg, s.face_to_path_deg,
//     s.spin_rate_rpm, s.backspin_rpm, s.sidespin_rpm, s.spin_axis_deg,
//     s.apex_height_yds, s.carry_deviation_distance_yds, s.carry_deviation_angle_deg,
//     s.swing_tempo, s.backswing_time_ms, s.downswing_time_ms, s.spin_rate_type
// FROM golf.Shots s
// JOIN golf.Clubs c ON s.club_id = c.club_id
// JOIN golf.Sessions se ON s.session_id = se.session_id
// ORDER BY s.session_id DESC, s.recorded_at ASC;
//
// 4. Run: node generate-coach-data.js
// 5. Upload the generated coach-data.json to your golf-app-data Blob container

const fs = require("fs");
const path = require("path");

function parseTSV(text) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => {
      const v = vals[i]?.trim() || "";
      // Try to parse numbers
      const num = parseFloat(v);
      obj[h] = !isNaN(num) && v !== "" ? num : v === "NULL" ? null : v;
    });
    return obj;
  });
}

function readFile(filename) {
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`⚠️  ${filename} not found — skipping`);
    return "";
  }
  return fs.readFileSync(filepath, "utf8");
}

console.log("📊 Reading SQL result files...");

const allTimeText = readFile("alltime.txt");
const lastSessionText = readFile("lastsession.txt");
const shotsText = readFile("shots.txt");

const allTime = parseTSV(allTimeText);
const lastSession = parseTSV(lastSessionText);
const shots = parseTSV(shotsText);

const coachData = {
  lastUpdated: new Date().toISOString(),
  totalShots: allTime.reduce((a, c) => a + (c.total_shots || 0), 0),
  allTime,
  lastSession,
  shots,
};

const outputPath = path.join(__dirname, "coach-data.json");
fs.writeFileSync(outputPath, JSON.stringify(coachData, null, 2));

console.log(`✅ coach-data.json created!`);
console.log(`   All-time clubs: ${allTime.length}`);
console.log(`   Last session clubs: ${lastSession.length}`);
console.log(`   Individual shots: ${shots.length}`);
console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
console.log(`\n📤 Next step: Upload coach-data.json to your Azure Blob Storage`);
console.log(`   Container: golf-app-data`);
console.log(`   Blob name: coach-data.json`);
