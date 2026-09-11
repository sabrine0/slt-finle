import 'package:flutter_test/flutter_test.dart';

import 'package:swarm_mobile/main.dart';

void main() {
  testWidgets('SwarmApp renders splash and navigates onward', (tester) async {
    await tester.pumpWidget(const SwarmApp());
    expect(find.text('Cerveau territorial'), findsOneWidget);
    expect(find.textContaining('SWARM-TRAFFIC AI'), findsOneWidget);

    await tester.pump(const Duration(seconds: 6));
    await tester.pump(const Duration(milliseconds: 500));
  });
}
