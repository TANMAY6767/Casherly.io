
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
const modelName = process.env.AI_MODEL || "gpt-4o-mini";

if (!apiKey) {
  console.error("❌ OPENAI_API_KEY is missing.");
  process.exit(1);
}

console.log("API key found:", `${apiKey.slice(0, 7)}...`);
console.log("Model:", modelName);

try {
  const model = new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0,
    timeout: 20000,
    maxTokens: 50,
  });

  // Test 1: Normal text generation
  const response = await model.invoke(
    "Reply with exactly: OPENAI_API_OK"
  );

  console.log("\n✅ Basic model call succeeded");
  console.log("Response:", response.content);

  // Test 2: Structured output, which your app also uses
  const classifier = model.withStructuredOutput(
    z.object({
      supported: z.boolean(),
      category: z.enum(["spending", "unsupported"]),
    })
  );

  const result = await classifier.invoke(
    "Classify this request: Which team spent the most last month?"
  );

  console.log("\n✅ Structured output succeeded");
  console.log(result);
} catch (error) {
  console.error("\n❌ OpenAI test failed");
  console.error("Message:", error.message);

  if (error.status) {
    console.error("HTTP status:", error.status);
  }

  if (error.code) {
    console.error("Error code:", error.code);
  }

  process.exitCode = 1;
}