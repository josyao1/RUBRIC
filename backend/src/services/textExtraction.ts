import { readFileSync } from 'fs';
import { extname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const TEXT_EXTENSIONS = ['.txt', '.py', '.java', '.js', '.ts', '.cpp', '.c', '.html', '.css', '.md'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export async function extractTextFromFile(filePath: string, originalName: string): Promise<string> {
  const ext = extname(originalName).toLowerCase();
  let extractedText = '';

  try {
    if (TEXT_EXTENSIONS.includes(ext)) {
      extractedText = readFileSync(filePath, 'utf-8');
    } else if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (IMAGE_EXTENSIONS.includes(ext)) {
      const Tesseract = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = text;
    }
  } catch (parseError) {
    console.error('[TEXT EXTRACTION] Error parsing file:', parseError);
    extractedText = '(Could not extract text)';
  }

  return extractedText;
}
