import tseslint from "typescript-eslint";

const declaration = (node) =>
  node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
    ? node.declaration
    : node;

const isModuleDeclaration = (node) => {
  const statement = declaration(node);
  return (
    statement &&
    [
      "ClassDeclaration",
      "FunctionDeclaration",
      "VariableDeclaration",
      "TSEnumDeclaration",
      "TSInterfaceDeclaration",
      "TSTypeAliasDeclaration",
    ].includes(statement.type)
  );
};

const needsModuleBlockSpacing = (node, sourceCode) => {
  const statement = declaration(node);
  if (!statement) return false;
  if (
    [
      "ClassDeclaration",
      "FunctionDeclaration",
      "TSEnumDeclaration",
      "TSInterfaceDeclaration",
      "TSTypeAliasDeclaration",
    ].includes(statement.type)
  ) {
    return true;
  }
  if (statement.type !== "VariableDeclaration") return false;
  const firstToken = sourceCode.getFirstToken(statement);
  const lastToken = sourceCode.getLastToken(statement);
  return firstToken.loc.start.line !== lastToken.loc.end.line;
};

const moduleBlockSpacing = {
  meta: {
    type: "layout",
    docs: { description: "separa los bloques de declaraciones de módulo" },
    fixable: "whitespace",
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program(program) {
        for (let index = 1; index < program.body.length; index += 1) {
          const previous = program.body[index - 1];
          const current = program.body[index];
          if (
            !previous ||
            !current ||
            !isModuleDeclaration(previous) ||
            !isModuleDeclaration(current)
          ) {
            continue;
          }
          const between = sourceCode.text.slice(previous.range[1], current.range[0]);
          const hasBlankLine = /\n\s*\n/.test(between);
          const needsSpacing =
            needsModuleBlockSpacing(previous, sourceCode) ||
            needsModuleBlockSpacing(current, sourceCode);
          if (needsSpacing && !hasBlankLine) {
            context.report({
              node: current,
              message:
                "Deja una línea en blanco entre bloques de declaraciones de módulo.",
              fix: (fixer) => fixer.insertTextAfter(previous, "\n"),
            });
          }
          if (!needsSpacing && hasBlankLine && /^\s+$/.test(between)) {
            context.report({
              node: current,
              message:
                "Agrupa las declaraciones de una sola línea sin líneas en blanco.",
              fix: (fixer) =>
                fixer.replaceTextRange([previous.range[1], current.range[0]], "\n"),
            });
          }
        }
      },
    };
  },
};

export default [
  {
    ignores: ["**/node_modules/**", "**/out/**", "**/release/**", "**/dist/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { nemeton: { rules: { "module-block-spacing": moduleBlockSpacing } } },
    rules: {
      curly: ["error", "all"],
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: ["const", "let", "var"],
          next: ["if", "for", "while", "do", "switch", "try", "function"],
        },
        {
          blankLine: "always",
          prev: ["if", "for", "while", "do", "switch", "try", "function"],
          next: ["const", "let", "var", "function", "class"],
        },
      ],
      "nemeton/module-block-spacing": "error",
    },
  },
];
