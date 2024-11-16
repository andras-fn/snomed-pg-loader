import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import pkg from "pg";
const { Client } = pkg;

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection configuration
const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "snomed",
  password: "postgres",
  port: 5433,
});

// Path to the TSV file
const tsvFilePath = path.join(__dirname, "accurx-snomed-subset.tsv");

// Function to read and parse the TSV file
async function parseTSV(filePath) {
  const results = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue; // Skip the header line
    }

    const [index, ConceptId, Term] = line.split("\t");

    if (ConceptId && Term) {
      results.push({ ConceptId, Term });
    }
  }

  return results;
}

// Function to write results to a TSV file
async function writeResultsToTsv(results, filePath) {
  const tsvData = results
    .map((row) => Object.values(row).join("\t"))
    .join("\n");
  fs.writeFileSync(filePath, tsvData);
  console.log(`Results written to ${filePath}`);
}

// Function to run the SQL script
async function runScript(subset) {
  try {
    await client.connect();

    // Create the subset_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subset_codes (
        ConceptId VARCHAR(255),
        Term VARCHAR(255)
      );
    `);

    // Clear any existing data in the subset_codes table
    await client.query("TRUNCATE TABLE subset_codes");

    // Insert the subset into the table
    for (let code of subset) {
      await client.query(
        "INSERT INTO subset_codes (ConceptId, Term) VALUES ($1, $2)",
        [code.ConceptId, code.Term]
      );
    }

    // Fetch and write data from descriptions table
    const descriptionsRes = await client.query(`
      SELECT conceptId, term, typeId, languageCode, active 
      FROM descriptions 
      WHERE conceptId IN (SELECT ConceptId FROM subset_codes) 
        AND active = true;
    `);
    await writeResultsToTsv(
      descriptionsRes.rows,
      path.join(__dirname, "descriptions.tsv")
    );

    // Fetch and write data from extended_map table
    const extendedMapRes = await client.query(`
      SELECT referencedComponentId, mapTarget, active 
      FROM extended_map 
      WHERE referencedComponentId IN (SELECT ConceptId FROM subset_codes) 
        AND active = true;
    `);
    await writeResultsToTsv(
      extendedMapRes.rows,
      path.join(__dirname, "extended_map.tsv")
    );

    console.log("Script executed successfully.");
  } catch (err) {
    console.error("Error executing script:", err);
  } finally {
    await client.end();
  }
}

// Main function to parse the TSV and run the script
async function main() {
  try {
    const subset = await parseTSV(tsvFilePath);
    console.log("Subset parsed:", subset); // Debugging line to check the subset
    await runScript(subset);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the main function
main();
