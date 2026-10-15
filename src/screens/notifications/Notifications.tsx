import moment from 'moment';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import AntDesign from 'react-native-vector-icons/AntDesign';

import { Container, Header, Text } from '../../components';
import { hp, Typography, wp } from '../../global';
import { openAppStore } from '../../lib/utils/rate-app';
import { notificationProfileId } from '../../notifications/notificationProfile';
import { routeNotification } from '../../notifications/routeNotification';
import { showNotificationMembership } from '../../notifications/showNotificationMembership';
import { Colors, Fonts } from '../../res';
import { useGlobalContext } from '../../services';
import notificationServices from '../../services/api/notification-services';
import type { AppNotification } from '../../services/api/types/notification-types';
import { useNotificationStore, usePremiumStore } from '../../stores';

const PER_PAGE = 20;

const Notifications = ({ navigation }: any) => {
  const { currentUser } = useGlobalContext();
  const isPremium = usePremiumStore((state) => state.isPremium);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const decrement = useNotificationStore((s) => s.decrement);
  const resetUnread = useNotificationStore((s) => s.reset);

  const load = useCallback(async (targetPage: number) => {
    const { results, total: totalCount } =
      await notificationServices.getNotifications(targetPage, PER_PAGE);
    setTotal(totalCount);
    setItems((prev) => (targetPage === 1 ? results : [...prev, ...results]));
    setPage(targetPage);
  }, []);

  useEffect(() => {
    // Defer state updates to avoid cascading renders
    setTimeout(() => {
      load(1)
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 0);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(1)
      .catch(() => null)
      .finally(() => setRefreshing(false));
  }, [load]);

  const onEndReached = useCallback(() => {
    if (loadingMore || items.length >= total) {
      return;
    }
    setLoadingMore(true);
    load(page + 1)
      .catch(() => null)
      .finally(() => setLoadingMore(false));
  }, [loadingMore, items.length, total, page, load]);

  const onItemPress = useCallback(
    async (item: AppNotification, profileOnly = false) => {
      if (!item.is_read) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        decrement();
        notificationServices.markAsRead(item.id).catch(() => null);
      }
      await routeNotification(navigation, item.type, {
        data: item.data,
        currentUserId: currentUser?.id,
        isPremium: isPremium(),
        profileOnly,
        deps: {
          openAppStore,
          onMembershipRequired: () => showNotificationMembership(navigation),
        },
      });
    },
    [navigation, decrement, currentUser?.id, isPremium]
  );

  const onDelete = useCallback(
    (item: AppNotification) => {
      setItems((prev) => prev.filter((n) => n.id !== item.id));
      if (!item.is_read) {
        decrement();
      }
      notificationServices.deleteNotification(item.id).catch(() => null);
    },
    [decrement]
  );

  const onMarkAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    resetUnread();
    notificationServices.markAllAsRead().catch(() => null);
  }, [resetUnread]);

  const onClearAll = useCallback(() => {
    setItems([]);
    setTotal(0);
    resetUnread();
    notificationServices.clearAll().catch(() => null);
  }, [resetUnread]);

  const renderRightActions = (item: AppNotification) => (
    <TouchableOpacity
      style={Styles.deleteAction}
      activeOpacity={0.8}
      onPress={() => onDelete(item)}
    >
      <AntDesign name="delete" color={Colors.color2} size={wp(5)} />
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: AppNotification }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <TouchableOpacity
        activeOpacity={0.7}
        style={[Styles.row, !item.is_read && Styles.rowUnread]}
        onPress={() => onItemPress(item)}
      >
        {item.image ? (
          <Image source={{ uri: item.image }} style={Styles.avatar} />
        ) : (
          <View style={[Styles.avatar, Styles.avatarFallback]}>
            <AntDesign name="bells" color={Colors.primary} size={wp(5)} />
          </View>
        )}
        <View style={Styles.rowBody}>
          <Text
            numberOfLines={1}
            style={[Styles.title, !item.is_read && Styles.titleUnread]}
          >
            {item.title}
          </Text>
          {!!item.body && (
            <Text numberOfLines={2} style={Styles.body}>
              {item.body}
            </Text>
          )}
          {!!item.created_at && (
            <Text style={Styles.time}>{moment(item.created_at).fromNow()}</Text>
          )}
          {notificationProfileId(item.type, item.data, currentUser?.id) && (
            <TouchableOpacity
              accessibilityRole="link"
              onPress={(event) => {
                event.stopPropagation();
                void onItemPress(item, true);
              }}
              style={{ marginTop: hp(0.5) }}
            >
              <Text style={{ color: Colors.primary }}>View profile</Text>
            </TouchableOpacity>
          )}
        </View>
        {!item.is_read && <View style={Styles.unreadDot} />}
      </TouchableOpacity>
    </Swipeable>
  );

  const headerActions = () => (
    <View style={Styles.headerActions}>
      <TouchableOpacity
        onPress={onMarkAllRead}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={Styles.headerAction}>Read all</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onClearAll}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[Styles.headerAction, Styles.headerActionDanger]}>
          Clear
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Container>
      <Header
        navigation={navigation}
        title="Notifications"
        customConponent={items.length > 0 ? headerActions : () => null}
      />
      {loading ? (
        <View style={Styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={
            items.length === 0 ? Styles.emptyContainer : undefined
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          ListEmptyComponent={
            <View style={Styles.center}>
              <AntDesign name="bells" color={Colors.muted} size={wp(12)} />
              <Text style={Styles.emptyText}>No notifications yet</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={{ marginVertical: hp(2) }}
                color={Colors.primary}
              />
            ) : null
          }
        />
      )}
    </Container>
  );
};

export default Notifications;

const Styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(6),
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyText: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small3,
    marginTop: hp(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp(1.6),
    paddingHorizontal: wp(4),
    backgroundColor: Colors.color2,
    borderBottomWidth: 0.7,
    borderBottomColor: Colors.hairline,
  },
  rowUnread: {
    backgroundColor: Colors.lavender,
  },
  avatar: {
    width: wp(11),
    height: wp(11),
    borderRadius: wp(11) / 2,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.lavender,
  },
  rowBody: {
    flex: 1,
    marginHorizontal: wp(3),
  },
  title: {
    color: Colors.ink,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small3,
  },
  titleUnread: {
    fontFamily: Fonts.APPFONT_B,
  },
  body: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small2,
    marginTop: hp(0.3),
  },
  time: {
    color: Colors.muted,
    fontFamily: Fonts.APPFONT_R,
    fontSize: Typography.small1,
    marginTop: hp(0.4),
  },
  unreadDot: {
    width: wp(2.2),
    height: wp(2.2),
    borderRadius: wp(2.2) / 2,
    backgroundColor: Colors.theme,
    marginLeft: wp(2),
  },
  deleteAction: {
    backgroundColor: Colors.theme,
    justifyContent: 'center',
    alignItems: 'center',
    width: wp(18),
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  headerAction: {
    color: Colors.primary,
    fontFamily: Fonts.APPFONT_B,
    fontSize: Typography.small2,
    marginLeft: wp(4),
  },
  headerActionDanger: {
    color: Colors.theme,
  },
});
