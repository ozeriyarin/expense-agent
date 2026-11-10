// Usage: npm run questions                      list open questions
//        npm run questions -- <id> <answer> [note]   answer one (options are listed with each question)
import { openDb } from "../db/client.js";
import { answerQuestion, listOpenQuestions } from "../db/questions.js";

const [id, answer, ...note] = process.argv.slice(2);
const db = await openDb();
if (id && answer) {
  await answerQuestion(db, Number(id), answer, note.join(" ") || undefined);
  console.log(`question ${id} answered: ${answer}`);
}
const open = await listOpenQuestions(db);
if (open.length === 0) console.log("no open questions");
for (const q of open) console.log(`#${q.id} [${q.type}] ${q.text}\n    options: ${q.options.join(" | ")}`);
