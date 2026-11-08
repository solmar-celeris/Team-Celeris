import { useState } from 'react';
import { Copy, FileDown } from 'lucide-react';
import recordPrompt from './prompts/registro-de-atividades.md?raw';
import popPrompt from './prompts/procedimento-operacional-padrao.md?raw';
import './documentation-prompts.css';

type DocumentationPrompt = {
  id: string;
  title: string;
  description: string;
  content: string;
  templateUrl: string;
  templateLabel: string;
};

const prompts: DocumentationPrompt[] = [
  {
    id: 'registro',
    title: 'Registro de Atividades',
    description: 'Organize relatos, fotos, áudios e documentos no template oficial de registro.',
    content: recordPrompt,
    templateUrl: 'https://docs.google.com/document/d/1rBBxJRcyNiBY7Fy9eibpBSZ_ctgmzyfL/export?format=docx',
    templateLabel: 'Baixar template de Registro de Atividades (DOCX)',
  },
  {
    id: 'pop',
    title: 'Procedimento Operacional Padrão (POP)',
    description: 'Elabore um POP novo ou revise um procedimento sem perder o histórico.',
    content: popPrompt,
    templateUrl: 'https://docs.google.com/document/d/1MRQZyQyggwlgq2oXCwoQ4JMCVHc4yI23/export?format=docx',
    templateLabel: 'Baixar template de POP (DOCX)',
  },
];

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('A cópia foi bloqueada pelo navegador. Selecione o texto do prompt e copie manualmente.');
}

export default function DocumentationPrompts() {
  const [copyMessage, setCopyMessage] = useState('');

  async function handleCopy(title: string, content: string) {
    try {
      await copyText(content);
      setCopyMessage(`${title} copiado. Cole o texto na plataforma de sua preferência.`);
    } catch {
      setCopyMessage('O navegador bloqueou a cópia. Abra o prompt e copie o texto manualmente.');
    }
  }

  return (
    <section className="manual-prompt-library" aria-labelledby="manual-prompt-library-title">
      <div className="manual-prompt-heading">
        <div>
          <p className="workspace-kicker">RECURSOS PARA DOCUMENTAÇÃO</p>
          <h3 id="manual-prompt-library-title">Prompts e templates oficiais</h3>
          <p>Consulte os prompts institucionais completos, copie o conteúdo ou baixe o template correspondente.</p>
        </div>
      </div>

      <div className="manual-prompt-list">
        {prompts.map((prompt) => (
          <article className="manual-prompt-item" key={prompt.id}>
            <div className="manual-prompt-item-heading">
              <div>
                <h4>{prompt.title}</h4>
                <p>{prompt.description}</p>
              </div>
              <a href={prompt.templateUrl} target="_blank" rel="noopener noreferrer" download>
                <FileDown aria-hidden="true" />
                {prompt.templateLabel}
              </a>
            </div>
            <details className="manual-prompt-card">
              <summary>
                <span>Ver prompt completo</span>
                <span className="manual-prompt-toggle" aria-hidden="true">+</span>
              </summary>
              <div className="manual-prompt-content">
                <button type="button" className="workspace-save-button" onClick={() => void handleCopy(prompt.title, prompt.content)}>
                  <Copy aria-hidden="true" /> Copiar prompt completo
                </button>
                <pre>{prompt.content}</pre>
              </div>
            </details>
          </article>
        ))}
      </div>

      {copyMessage && <p className="manual-prompt-feedback" role="status">{copyMessage}</p>}
      <p className="manual-prompt-note">Os destinos indicados nos prompts são orientações. O aplicativo não afirma ter salvo arquivos no Drive sem acesso e autorização para essa ação.</p>
    </section>
  );
}
