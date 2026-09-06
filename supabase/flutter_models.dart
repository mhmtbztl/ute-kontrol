// UTE Kontrol Merkezi V5 - Flutter Domain Models & Data Architecture
// Uludağ Tatil Evleri: Seyir, Doğuş, Zirve, Şirin, Nefes

import 'package:flutter/foundation.dart';

enum VillaId { SEYIR, DOGUS, ZIRVE, SIRIN, NEFES }
enum ChannelType { airbnb, booking, whatsapp, instagram, website, phone, repeat, other }
enum PriorityType { p1, p2, p3 }

class Property {
  final String id;
  final String name;
  final int capacity;
  final int bedrooms;
  final double bathrooms;
  final double distancePisteKm;
  final double floorRate;
  final double baseRate;
  final double targetRate;
  final double premiumRate;
  final double peakRate;
  final double cleaningCost;
  final double heatingDailyCost;

  const Property({
    required this.id,
    required this.name,
    required this.capacity,
    required this.bedrooms,
    required this.bathrooms,
    required this.distancePisteKm,
    required this.floorRate,
    required this.baseRate,
    required this.targetRate,
    required this.premiumRate,
    required this.peakRate,
    required this.cleaningCost,
    required this.heatingDailyCost,
  });

  factory Property.fromJson(Map<String, dynamic> json) {
    return Property(
      id: json['id'],
      name: json['name'],
      capacity: json['capacity'] as int,
      bedrooms: json['bedrooms'] as int,
      bathrooms: (json['bathrooms'] as num).toDouble(),
      distancePisteKm: (json['distance_piste_km'] as num).toDouble(),
      floorRate: (json['floor_rate'] as num).toDouble(),
      baseRate: (json['base_rate'] as num).toDouble(),
      targetRate: (json['target_rate'] as num).toDouble(),
      premiumRate: (json['premium_rate'] as num).toDouble(),
      peakRate: (json['peak_rate'] as num).toDouble(),
      cleaningCost: (json['cleaning_cost'] as num).toDouble(),
      heatingDailyCost: (json['heating_daily_cost'] as num).toDouble(),
    );
  }
}

class Booking {
  final String id;
  final String bookingCode;
  final String propertyId;
  final String guestName;
  final String channel;
  final DateTime checkIn;
  final DateTime checkOut;
  final int pax;
  final double grossAmount;
  final double otaCommission;
  final double cleaningFee;
  final double discount;
  final String status;

  const Booking({
    required this.id,
    required this.bookingCode,
    required this.propertyId,
    required this.guestName,
    required this.channel,
    required this.checkIn,
    required this.checkOut,
    required this.pax,
    required this.grossAmount,
    required this.otaCommission,
    required this.cleaningFee,
    required this.discount,
    required this.status,
  });

  int get nights => checkOut.difference(checkIn).inDays;

  // Pure Room Net Accommodation Revenue (USALI standard)
  double get netRoomRevenue {
    final net = grossAmount - otaCommission - cleaningFee - discount;
    return net > 0 ? net : 0.0;
  }

  double get revenuePerNight => nights > 0 ? netRoomRevenue / nights : 0.0;

  bool get isDirect => ['WhatsApp', 'Instagram', 'Website', 'Phone', 'Repeat'].contains(channel);

  factory Booking.fromJson(Map<String, dynamic> json) {
    return Booking(
      id: json['id'],
      bookingCode: json['booking_code'],
      propertyId: json['property_id'],
      guestName: json['guest_name'],
      channel: json['channel'],
      checkIn: DateTime.parse(json['check_in']),
      checkOut: DateTime.parse(json['check_out']),
      pax: json['pax'] as int,
      grossAmount: (json['gross_amount'] as num).toDouble(),
      otaCommission: (json['ota_commission'] as num).toDouble(),
      cleaningFee: (json['cleaning_fee'] as num).toDouble(),
      discount: (json['discount'] as num).toDouble(),
      status: json['status'],
    );
  }
}

class TodayAction {
  final String category; // 'P1_ARIZA', 'CHECK_IN', 'CHECK_OUT', 'LEAD_TAKIP', 'EK_GECE_FIRSATI'
  final String title;
  final String detail;
  final String actionLabel;
  final int urgencyScore;

  const TodayAction({
    required this.category,
    required this.title,
    required this.detail,
    required this.actionLabel,
    this.urgencyScore = 1,
  });
}
