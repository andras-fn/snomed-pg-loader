import { createClient } from "@libsql/client";
import { pipeline } from "@huggingface/transformers";

(async () => {
  // Start time for the entire script
  const scriptStartTime = Date.now();

  // Create db client
  console.log("Creating db client...");
  const dbClientStartTime = Date.now();
  const db = createClient({
    url: "file:local.db",
  });
  const dbClientEndTime = Date.now();
  console.log(
    `DB client creation took ${dbClientEndTime - dbClientStartTime} ms`
  );

  // Create transformer pipeline
  console.log("Initializing transformer pipeline...");
  const pipelineStartTime = Date.now();
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const pipelineEndTime = Date.now();
  console.log(
    `Transformer pipeline initialization took ${
      pipelineEndTime - pipelineStartTime
    } ms`
  );

  // Search term
  const searchTerm = process.argv[2];

  if (!searchTerm) {
    console.error("Please provide a search term as a command-line argument.");
    process.exit(1);
  }

  // Generate embedding from search term
  console.log("Generating embedding from search term...");
  const embeddingStartTime = Date.now();
  const searchEmbedding = await pipe(searchTerm, {
    pooling: "mean",
    normalize: true,
  });
  const embeddingEndTime = Date.now();
  console.log(
    `Embedding generation took ${embeddingEndTime - embeddingStartTime} ms`
  );

  // Convert the embedding tensor to a plain array
  const embeddingArray = Array.from(searchEmbedding.data);

  // Convert the embedding array to a JSON string
  const embeddingString = JSON.stringify(embeddingArray);

  // Search db
  console.log("Searching db...");
  const dbSearchStartTime = Date.now();
  const searchResult = await db.execute(
    `SELECT id, conceptId, term, vector_distance_cos(embedding, vector(?)) AS distance
     FROM snomed_embeddings
     ORDER BY distance
     LIMIT 100`,
    [embeddingString]
  );
  const dbSearchEndTime = Date.now();
  console.log(`Database search took ${dbSearchEndTime - dbSearchStartTime} ms`);

  // Print results
  console.log("Search results:");
  searchResult.rows.forEach((row) => {
    console.log(
      `Record ID: ${row.id}, Concept ID: ${row.conceptId}, Term: ${row.term}, Distance: ${row.distance}`
    );
  });

  // End time for the entire script
  const scriptEndTime = Date.now();
  console.log(
    `Total script execution time: ${scriptEndTime - scriptStartTime} ms`
  );
})();
