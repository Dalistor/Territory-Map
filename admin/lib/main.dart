import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:territory_admin/data/providers.dart';
import 'package:territory_admin/data/session.dart';
import 'package:territory_admin/presentation/home_screen.dart';
import 'package:territory_admin/presentation/setup_screen.dart';

void main() => runApp(const ProviderScope(child: TerritoryAdminApp()));

class TerritoryAdminApp extends StatelessWidget {
  const TerritoryAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Territory Map',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2E7D32),
        useMaterial3: true,
      ),
      home: const _Root(),
    );
  }
}

/// Decides between the setup screen and the map, and nothing else.
class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref
        .watch(isConfiguredProvider)
        .when(
          loading: () =>
              const Scaffold(body: Center(child: CircularProgressIndicator())),
          // A keystore that cannot be read is not something retrying fixes,
          // but typing the credentials again does.
          error: (_, _) => const SetupScreen(
            reason: 'Não foi possível ler os dados guardados neste computador.',
          ),
          data: (configured) =>
              configured ? const _Authenticated() : const SetupScreen(),
        );
  }
}

/// Renders the map, falling back to setup when the stored credentials stop
/// being accepted -- a password changed on the server, typically.
class _Authenticated extends ConsumerWidget {
  const _Authenticated();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rejected = ref.watch(territoriesProvider).error;
    if (rejected is CredentialsRejectedException) {
      return SetupScreen(reason: rejected.message);
    }
    return const HomeScreen();
  }
}
