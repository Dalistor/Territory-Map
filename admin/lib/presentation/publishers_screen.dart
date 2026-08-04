/// Registering publishers and handing out their access codes.
///
/// The code is a credential: it is shown here while it is alive and disappears
/// once redeemed or expired. It must never be logged, and it is never put in a
/// URL. Regenerating one is the answer to a lost phone, a reinstall or an
/// expired code -- and it invalidates whatever the person had before.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_core/territory_core.dart';

final publishersProvider = FutureProvider<List<Publisher>>((ref) {
  final api = ref.watch(apiProvider);
  return ref.watch(sessionProvider).run(api.listPublishers);
});

class PublishersScreen extends ConsumerWidget {
  const PublishersScreen({super.key, this.now});

  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final publishers = ref.watch(publishersProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Publicadores')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.person_add),
        label: const Text('Cadastrar'),
      ),
      body: publishers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              error is ApiException
                  ? error.message
                  : 'Não foi possível carregar os publicadores.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Nenhum publicador cadastrado.'))
            : ListView.separated(
                itemCount: list.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) => _PublisherTile(
                  publisher: list[index],
                  now: now ?? DateTime.now(),
                ),
              ),
      ),
    );
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => const _NameDialog(),
    );
    if (name == null || !context.mounted) return;

    final api = ref.read(apiProvider);
    try {
      final publisher = await ref
          .read(sessionProvider)
          .run(() => api.createPublisher(name));
      ref.invalidate(publishersProvider);
      if (context.mounted) await _showCode(context, publisher);
    } on ApiException catch (error) {
      if (context.mounted) _toast(context, error.message);
    }
  }
}

/// Presents the freshly minted code so it can be read out to the person.
Future<void> _showCode(BuildContext context, Publisher publisher) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Código de ${publisher.name}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SelectableText(
            publisher.accessCode ?? '—',
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              letterSpacing: 6,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Entregue este código à pessoa. Ele vale 24 horas, serve uma única '
            'vez e não poderá ser consultado depois de usado.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: publisher.accessCode ?? ''));
            Navigator.of(context).pop();
          },
          child: const Text('Copiar'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Fechar'),
        ),
      ],
    ),
  );
}

void _toast(BuildContext context, String message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text(message)));

class _PublisherTile extends ConsumerWidget {
  const _PublisherTile({required this.publisher, required this.now});

  final Publisher publisher;
  final DateTime now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      leading: Icon(
        publisher.isActive ? Icons.person : Icons.person_off,
        color: publisher.isActive ? null : Theme.of(context).disabledColor,
      ),
      title: Text(publisher.name),
      subtitle: Text(_status()),
      trailing: PopupMenuButton<String>(
        onSelected: (action) => _act(context, ref, action),
        itemBuilder: (_) => [
          if (publisher.hasLiveCode(now))
            const PopupMenuItem(value: 'show', child: Text('Ver código')),
          const PopupMenuItem(value: 'code', child: Text('Gerar novo código')),
          PopupMenuItem(
            value: 'toggle',
            child: Text(publisher.isActive ? 'Desativar' : 'Reativar'),
          ),
        ],
      ),
    );
  }

  String _status() {
    if (!publisher.isActive) {
      return 'Acesso revogado — o histórico de trabalho continua guardado.';
    }
    if (publisher.hasLiveCode(now)) {
      return 'Código válido, aguardando ser usado.';
    }
    if (publisher.isPending) {
      return 'Sem código válido. Gere um novo para esta pessoa entrar.';
    }
    return 'Ativo neste aparelho.';
  }

  Future<void> _act(BuildContext context, WidgetRef ref, String action) async {
    final api = ref.read(apiProvider);
    final session = ref.read(sessionProvider);
    try {
      switch (action) {
        case 'show':
          await _showCode(context, publisher);
        case 'code':
          final updated = await session.run(
            () => api.regenerateAccessCode(publisher.id),
          );
          ref.invalidate(publishersProvider);
          if (context.mounted) await _showCode(context, updated);
        case 'toggle':
          await session.run(
            () => api.setPublisherActive(publisher.id, !publisher.isActive),
          );
          ref.invalidate(publishersProvider);
      }
    } on ApiException catch (error) {
      if (context.mounted) _toast(context, error.message);
    }
  }
}

class _NameDialog extends StatefulWidget {
  const _NameDialog();

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _controller.text.trim();
    if (name.isNotEmpty) Navigator.of(context).pop(name);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Cadastrar publicador'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        decoration: const InputDecoration(
          labelText: 'Nome da pessoa',
          border: OutlineInputBorder(),
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _controller.text.trim().isEmpty ? null : _submit,
          child: const Text('Gerar código'),
        ),
      ],
    );
  }
}
