import { createClient } from "@libsql/client";
import { pipeline } from "@huggingface/transformers";

(async () => {
  // create db client
  const db = createClient({
    url: "file:local.db",
  });

  // create transformer pipeline
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  // search term
  const searchTerm = process.argv[2];

  if (!searchTerm) {
    console.error("Please provide a search term as a command-line argument.");
    process.exit(1);
  }

  // generate embedding from search term
  console.log("Generating embedding from search term");
  const searchEmbedding = await pipe(searchTerm, {
    pooling: "mean",
    normalize: true,
  });

  // Log the embedding for debugging purposes
  //console.log("Search embedding:");
  //console.log(searchEmbedding);

  // Convert the embedding tensor to a plain array
  const embeddingArray = Array.from(searchEmbedding.data);

  // Convert the embedding array to a JSON string
  const embeddingString = JSON.stringify(embeddingArray);

  // search db
  console.log("Searching db");
  const searchResult = await db.execute(
    `SELECT id, conceptId, snomed_term, icd_code, is_preferred_term, vector_distance_cos(embedding, vector(?)) AS distance
     FROM snomed_embeddings
     ORDER BY distance
     LIMIT 100`,
    [embeddingString]
  );

  // print results
  console.log("Search results:");
  searchResult.rows.forEach((row) => {
    console.log(
      `Record ID: ${row.id}, Concept ID: ${row.conceptId}, SNOMED Term: ${row.snomed_term}, ICD Code: ${row.icd_code}, Is Preferred Term: ${row.is_preferred_term}, Distance: ${row.distance}`
    );
  });
})();
