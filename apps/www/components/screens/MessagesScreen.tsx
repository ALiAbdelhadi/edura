"use client";

import React, { useState, useEffect, useRef } from "react";
import { useList, useCustomMutation, useCustom } from "@refinedev/core";
import { Card, Input, Button, List, Avatar, Badge, Spin, Space, Row, Col } from "antd";
import { SendOutlined, UserOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

export function MessagesScreen() {
  const { t, formatDate } = useI18n();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  // Optimistic unread-clear: track which thread IDs the user has opened.
  const [readThreadIds, setReadThreadIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch threads
  const { query: threadsQuery, result: threadsResult } = useList({
    resource: "messages/threads",
    pagination: { mode: "off" },
    queryOptions: {
      refetchInterval: 10000,
    }
  });

  const threads = (threadsResult?.data ?? []) as any[];

  // Fetch messages for selected thread
  const { query: messagesQuery, result: messagesResult } = useCustom({
    url: selectedThreadId ? `messages/threads/${selectedThreadId}` : "",
    method: "get",
    queryOptions: {
      enabled: !!selectedThreadId,
      refetchInterval: 5000,
    }
  });

  const messages = (messagesResult?.data ?? []) as any[];

  const { mutateAsync: sendMessage, mutation } = useCustomMutation();

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedThreadId) return;
    try {
      await sendMessage({
        url: "messages",
        method: "post",
        values: {
          threadId: selectedThreadId,
          body: newMessage.trim(),
        },
      });
      setNewMessage("");
      messagesQuery.refetch();
      threadsQuery.refetch();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Card styles={{ body: { padding: 0 } }}>
      <Row style={{ minHeight: "600px", height: "calc(100vh - 200px)" }}>
        {/* Sidebar - Threads */}
        <Col xs={24} md={8} style={{ borderRight: "1px solid #f0f0f0", height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0", fontWeight: "bold" }}>
            {t("nav.messages")}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {threadsQuery.isLoading ? (
              <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>
            ) : threads.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#888" }}>{t("shared.msgEmpty")}</div>
            ) : (
              <List
                itemLayout="horizontal"
                dataSource={threads}
                renderItem={(thread) => (
                  <List.Item
                    onClick={() => {
                      setSelectedThreadId(thread._id);
                      // Optimistically mark as read — proper state update, not cache mutation.
                      if (thread.unreadCount > 0) {
                        setReadThreadIds((prev) => new Set(prev).add(thread._id));
                      }
                    }}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      backgroundColor: selectedThreadId === thread._id ? "#e6f4ff" : "transparent",
                      borderBottom: "1px solid #f0f0f0",
                      transition: "background-color 0.2s"
                    }}
                  >
                    <List.Item.Meta
                      avatar={
                        <Badge count={readThreadIds.has(thread._id) ? 0 : thread.unreadCount} size="small">
                          <Avatar icon={<UserOutlined />} />
                        </Badge>
                      }
                      title={thread.otherParticipant?.name || t("shared.msgUnknownUser")}
                      description={
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#888", fontSize: "12px" }}>
                          <span style={{ 
                            whiteSpace: "nowrap", 
                            overflow: "hidden", 
                            textOverflow: "ellipsis", 
                            maxWidth: "70%",
                            fontWeight: !readThreadIds.has(thread._id) && thread.unreadCount > 0 ? "bold" : "normal",
                            color: !readThreadIds.has(thread._id) && thread.unreadCount > 0 ? "#000" : "#888"
                          }}>
                            {thread.lastMessageBody || t("shared.msgNoPreview")}
                          </span>
                          <span>{formatDate(thread.lastMessageAt, { month: "short", day: "numeric" })}</span>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </Col>

        {/* Chat Area */}
        <Col xs={24} md={16} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {selectedThreadId ? (
            <>
              {/* Header */}
              <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center" }}>
                <Avatar icon={<UserOutlined />} style={{ marginRight: 12 }} />
                <strong>{threads.find(t => t._id === selectedThreadId)?.otherParticipant?.name}</strong>
              </div>
              
              {/* Messages Area */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px", backgroundColor: "#f9fafb" }}>
                {messagesQuery.isLoading ? (
                  <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>
                ) : (
                  <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    {messages.map((msg) => {
                      // Use the `mine` flag tagged by the API — avoids ObjectId
                      // serialization mismatches from comparing senderId strings.
                      const isMe = !!msg.mine;
                      
                      return (
                        <div key={msg._id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                          <div
                            style={{
                              maxWidth: "70%",
                              padding: "10px 14px",
                              borderRadius: "16px",
                              borderBottomRightRadius: isMe ? "4px" : "16px",
                              borderBottomLeftRadius: isMe ? "16px" : "4px",
                              backgroundColor: isMe ? "#0fa5e9" : "#fff",
                              color: isMe ? "#fff" : "#000",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                            }}
                          >
                            <div style={{ wordBreak: "break-word" }}>{msg.body}</div>
                            <div style={{ fontSize: "10px", marginTop: "4px", textAlign: "right", opacity: 0.7 }}>
                              {formatDate(msg.createdAt, { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </Space>
                )}
              </div>

              {/* Input Area */}
              <div style={{ padding: "16px", borderTop: "1px solid #f0f0f0", backgroundColor: "#fff" }}>
                <div style={{ display: "flex" }}>
                  <Input
                    placeholder={t("shared.msgInputPlaceholder")}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onPressEnter={handleSend}
                    size="large"
                    style={{ borderRadius: "20px" }}
                  />
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<SendOutlined />}
                    size="large"
                    style={{ marginLeft: "8px", backgroundColor: "#0fa5e9" }}
                    onClick={handleSend}
                    loading={mutation.isPending}
                    disabled={!newMessage.trim()}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", backgroundColor: "#f9fafb" }}>
              {t("shared.msgSelectThread")}
            </div>
          )}
        </Col>
      </Row>
    </Card>
  );
}
