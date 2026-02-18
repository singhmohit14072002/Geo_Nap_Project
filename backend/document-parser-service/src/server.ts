import dotenv from "dotenv";
import app from "./app";

dotenv.config();

const port = Number(process.env.PORT ?? 4020);

app.listen(port, () => {
  console.log(`[document-parser-service] running on port ${port}`);
});
