import { resolveTemplate } from "./templates/registry";
import {
  parseTemplatePayload,
  readTemplateStateFromSearchParams,
} from "./templates/url-template-state";

function App() {
  const templateState = readTemplateStateFromSearchParams(
    window.location.search
  );

  if (!templateState) {
    throw new Error("Missing template state");
  }

  const template = resolveTemplate(templateState.templateKey);

  if (!template) {
    throw new Error(`Unknown template key: ${templateState.templateKey}`);
  }

  const TemplateComponent = template.component;

  const templatePayload = parseTemplatePayload(templateState.rawPayload);

  if (templateState.captureMode) {
    return (
      <div data-template-ready="true">
        <TemplateComponent {...templatePayload} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10">
      <section className="mx-auto w-fit">
        <div className="origin-top scale-[0.34] rounded-xl border border-zinc-800 shadow-2xl shadow-black/70">
          <TemplateComponent {...templatePayload} />
        </div>
      </section>
    </main>
  );
}

export default App;
