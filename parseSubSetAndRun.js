const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Client } = require("pg");

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

// Output JSON file path
const outputJsonFilePath = path.join(__dirname, "snomed_icd_mapping.json");

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

// Function to write results to a JSON file
async function writeResultsToJson(results, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
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

    // Create the snomed_icd_mapping table
    await client.query(`
      CREATE TABLE IF NOT EXISTS snomed_icd_mapping (
        conceptId VARCHAR(255),
        snomed_term VARCHAR(255),
        icd_code VARCHAR(255),
        is_preferred_term VARCHAR(3)
      );
    `);

    // Clear any existing data in the snomed_icd_mapping table
    await client.query("TRUNCATE TABLE snomed_icd_mapping");

    // Insert the results into the snomed_icd_mapping table
    await client.query(`
      INSERT INTO snomed_icd_mapping (conceptId, snomed_term, icd_code, is_preferred_term)
      WITH ConceptMatches AS (
        SELECT conceptId
        FROM descriptions
        WHERE conceptId IN (SELECT ConceptId FROM subset_codes)
          AND active = true
      )
      SELECT 
        cm.conceptId, 
        td.term AS snomed_term, 
        em.mapTarget AS icd_code,
        CASE 
          WHEN td.typeId = '900000000000003001' THEN 'Yes' 
          ELSE 'No' 
        END AS is_preferred_term
      FROM ConceptMatches cm
      JOIN descriptions td ON cm.conceptId = td.conceptId
      JOIN extended_map em ON cm.conceptId = em.referencedComponentId
      WHERE td.active = true
        AND td.languageCode = 'en'
        AND em.active = true;
    `);

    console.log("Script executed successfully.");

    // Fetch the results from snomed_icd_mapping table
    const res = await client.query("SELECT * FROM snomed_icd_mapping");
    const results = res.rows;

    // Write the results to a JSON file
    await writeResultsToJson(results, outputJsonFilePath);
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
