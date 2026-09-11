/// Google Maps JSON styles — dark twilight (SWARM brand) + clean light.
class MapStyle {
  MapStyle._();

  static const dark = '''
[
  {"elementType":"geometry","stylers":[{"color":"#142039"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#94A3B8"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#101A2E"}]},
  {"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#1A2745"}]},
  {"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#CBD5E1"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#64748B"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#1E3A2F"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#10B981"}]},
  {"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#243456"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#1A2745"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#A7C8FF"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#1A5FDC"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#2A7BFF"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#1A2745"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#14B8A6"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#0A1228"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#1A5FDC"}]}
]
''';

  static const light = '''
[
  {"elementType":"geometry","stylers":[{"color":"#F8FAFC"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#334155"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#FFFFFF"}]},
  {"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#E2E8F0"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#64748B"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#DCFCE7"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#065F46"}]},
  {"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#FFFFFF"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#E2E8F0"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#DBEAFE"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#93C5FD"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#BFDBFE"}]}
]
''';
}
