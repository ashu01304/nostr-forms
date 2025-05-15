import { useEffect, useState } from "react";
import { Event, getPublicKey, nip19, SubCloser } from "nostr-tools";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchFormResponses } from "../../nostr/responses";
import SummaryStyle from "./summary.style";
import { Button, Card, Divider, Table, Typography, Modal, Descriptions, Space, Spin } from "antd";
import ResponseWrapper from "./Responses.style";
import { isMobile } from "../../utils/utility";
import { useProfileContext } from "../../hooks/useProfileContext";
import { fetchFormTemplate } from "../../nostr/fetchFormTemplate";
import { hexToBytes } from "@noble/hashes/utils";
import { fetchKeys, getAllowedUsers, getFormSpec as getFormSpecFromEventUtil } from "../../utils/formUtils"; 
import { Export } from "./Export";
import { Field, Tag } from "../../nostr/types";
import { useApplicationContext } from "../../hooks/useApplicationContext";
import { ResponseDetailModal } from './components/ResponseDetailModal';
import { getDefaultRelays } from "../../nostr/common";
import { getResponseRelays, getInputsFromResponseEvent, processResponseInputTag } from "../../utils/ResponseUtils"; 

const { Text } = Typography;

export const Response = () => {
  const [responses, setResponses] = useState<Event[] | undefined>(undefined);
  const [formEvent, setFormEvent] = useState<Event | undefined>(undefined);
  const [formSpec, setFormSpec] = useState<Tag[] | null | undefined>(undefined);
  const [editKey, setEditKey] = useState<string | undefined | null>();
  let { pubKey, formId, secretKey } = useParams();
  let [searchParams] = useSearchParams();
  const { pubkey: userPubkey, requestPubkey } = useProfileContext();
  const viewKeyParams = searchParams.get("viewKey");
  const [responseCloser, setResponsesCloser] = useState<SubCloser | null>(null);
  const [selectedEventForModal, setSelectedEventForModal] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  let { poolRef } = useApplicationContext();
  const [isFormSpecLoading, setIsFormSpecLoading] = useState(true); 

  const handleResponseEvent = (event: Event) => {
    console.log("Got a response", event);
    setResponses((prev: Event[] | undefined) => {
      if (prev?.some(e => e.id === event.id)) {
        return prev;
      }
      return [...(prev || []), event];
    });
  };

  const initialize = async () => {
    if (!formId) return;
    if (!(pubKey || secretKey)) return;
    if(!poolRef?.current) return;
    setIsFormSpecLoading(true); 

    if (secretKey) {
      setEditKey(secretKey);
      pubKey = getPublicKey(hexToBytes(secretKey));
    }
    let relay = searchParams.get("relay");
    fetchFormTemplate(
      pubKey!,
      formId,
      poolRef.current,
      async (event: Event) => {
        setFormEvent(event);
        if (!secretKey) {
          if (userPubkey) {
            let keys = await fetchKeys(event.pubkey, formId!, userPubkey);
            let fetchedEditKey = keys?.find((k) => k[0] === "EditAccess")?.[1] || null;
            setEditKey(fetchedEditKey);
          }
        }
        const spec = await getFormSpecFromEventUtil(
          event,
          userPubkey,
          null,
          viewKeyParams
        );
        setFormSpec(spec);
        setIsFormSpecLoading(false);
      },
      relay ? [relay!] : undefined
    );
  };

  useEffect(() => {
    if (!(pubKey || secretKey) || !formId || !poolRef?.current) return;
    initialize();
    return () => {
      if (responseCloser) responseCloser.close();
    };
  }, [pubKey, formId, secretKey, poolRef, userPubkey, viewKeyParams]);

  useEffect(() => {
    if (!formEvent || !formId || responses !== undefined) return;
    let allowedPubkeys;
    let pubkeys = getAllowedUsers(formEvent);
    if (pubkeys.length !== 0) allowedPubkeys = pubkeys;
    let formRelays = getResponseRelays(formEvent);
    let closer = fetchFormResponses(
      formEvent.pubkey,
      formId,
      poolRef.current,
      handleResponseEvent,
      allowedPubkeys,
      formRelays
    );
    setResponsesCloser(responseCloser);
  }, [formEvent]);

  useEffect(() => {
    if (!(pubKey || secretKey) || !formId || !poolRef?.current) return;
    if (responses === undefined && formEvent === undefined) {
      initialize();
    }
    return () => {
      if (responseCloser) responseCloser.close();
    };
  }, [pubKey, formId, secretKey, poolRef, userPubkey, viewKeyParams]);

  const getResponderCount = () => {
    if (!responses) return 0;
    return new Set(responses.map((r) => r.pubkey)).size;
  };

  const handleRowClick = (record: any) => {
     const authorPubKey = record.key;
     if (!responses) return;
     const authorEvents = responses.filter(event => event.pubkey === authorPubKey);
     if (authorEvents.length === 0) return;
     const latestEvent = authorEvents.sort((a, b) => b.created_at - a.created_at)[0];

     setSelectedEventForModal(latestEvent);
     setIsModalOpen(true);
  };

  const getData = (useLabels: boolean = false) => {
    let answers: Array<{
      [key: string]: string;
    }> = [];
    if (!formSpec || !responses) return answers; 
    let responsePerPubkey = new Map<string, Event[]>();
    responses.forEach((r: Event) => {
      let existingResponse = responsePerPubkey.get(r.pubkey);
      if (!existingResponse) responsePerPubkey.set(r.pubkey, [r]);
      else responsePerPubkey.set(r.pubkey, [...existingResponse, r]);
    });

    Array.from(responsePerPubkey.keys()).forEach((pub) => {
      let pubkeyResponses = responsePerPubkey.get(pub);
      if (!pubkeyResponses || pubkeyResponses.length === 0) return;
      let responseEvent = pubkeyResponses.sort( 
        (a, b) => b.created_at - a.created_at
      )[0];
      let inputs = getInputsFromResponseEvent(responseEvent, editKey) as Tag[]; 
      if (inputs.length === 0 && responseEvent.content !== "" && !editKey) { 
        console.warn(`Could not decrypt response for ${nip19.npubEncode(responseEvent.pubkey)} for table row.`);
      }

      let answerObject: {
        [key: string]: string;
      } = {
        key: responseEvent.pubkey,
        createdAt: new Date(responseEvent.created_at * 1000).toDateString(),
        authorPubkey: nip19.npubEncode(responseEvent.pubkey),
        responsesCount: pubkeyResponses.length.toString(),
      };
      inputs.forEach((input) => {
        if (!Array.isArray(input) || input.length < 2) return;
        const { questionLabel, responseLabel, fieldId } = processResponseInputTag(input, formSpec);
        const displayKey = useLabels ? questionLabel : fieldId;
        answerObject[displayKey] = responseLabel;
      });
      answers.push(answerObject);
    });
    return answers;
  };

  const getFormName = () => {
    if (!formSpec) return "Loading Form Name..."; 
    let nameTag = formSpec.find((tag) => tag[0] === "name");
    if (nameTag) return nameTag[1] || "Untitled Form";
    return "Untitled Form";
  };

  const getColumns = () => {
    const columns: Array<{
      key: string;
      title: string;
      dataIndex: string;
      fixed?: "left" | "right";
      width?: number;
      render?: (data: string, record: any) => JSX.Element;
    }> = [
      {
        key: "author",
        title: "Author",
        fixed: "left",
        dataIndex: "authorPubkey",
        width: isMobile() ? 120 : 150,
        render: (data: string) => (
          <a
            href={`https://njump.me/${data}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {isMobile() ? `${data.substring(0,10)}...${data.substring(data.length-5)}` : data}
          </a>
        ),
      },
      {
        key: "responsesCount",
        title: "Submissions",
        dataIndex: "responsesCount",
        width: isMobile() ? 90 : 120,
      },
    ];
    const rightColumns: Array<{
      key: string;
      title: string;
      dataIndex: string;
      fixed?: "left" | "right";
      width?: number;
      render?: (data: string) => JSX.Element;
    }> = [
      {
        key: "createdAt",
        title: "Submitted At",
        dataIndex: "createdAt",
        width: isMobile() ? 100 : 130,
      },
    ];
    let uniqueQuestionIds: Set<string> = new Set();
    responses?.forEach((response: Event) => {
      let responseTags = getInputsFromResponseEvent(response, editKey);
      responseTags.forEach((t: Tag) => {
        if (Array.isArray(t) && t.length > 1) uniqueQuestionIds.add(t[1]);
      });
    });
    let fields =
      formSpec?.filter((field) => field[0] === "field") || ([] as Field[]);

    fields.forEach((field) => {
      let [_, fieldId, __, label, ___, ____] = field;
      columns.push({
        key: fieldId,
        title: label || `Question: ${fieldId.substring(0,5)}...`,
        dataIndex: label || fieldId,
        width: 150,
      });
      uniqueQuestionIds.delete(fieldId); 
    });
    const extraFields = Array.from(uniqueQuestionIds); 
    extraFields.forEach((q) => {
      columns.push({
        key: q,
        title: `Question ID: ${q.substring(0,8)}...`, 
        dataIndex: q, 
        width: 150,
      });
    });
    if (formSpec === null && responses && extraFields.length > 0 && fields.length === 0) { 
      extraFields.forEach(id => {
         
        if (!columns.find(col => col.key === id)) {
            columns.push({ key: id, title: `Question ID: ${id.substring(0,8)}...`, dataIndex: id, width: 150 });
        }
      });
    }
    return [...columns, ...rightColumns];
  };

  if (!(pubKey || secretKey) || !formId) return <Text>Invalid url</Text>;

  if (formEvent && formEvent.content !== "" && !userPubkey && !viewKeyParams && !editKey) { 
    return (
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <Text>This form's responses are private. You need to login or have a view key to see them.</Text>
        <Button
          onClick={() => {
            requestPubkey();
          }}
          style={{ marginTop: '10px' }}
        >
          Login
        </Button>
      </div>
    );
  }
  if (isFormSpecLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Spin size="large" tip="Loading form details..." />
      </div>
    );
  }
  if (formSpec === null && formEvent && formEvent.content !== "") { 
     return <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <Text>Could not load or decrypt form specification. Responses cannot be displayed.</Text>
            </div>;
  }

  return (
    <div>
      <SummaryStyle>
        <div className="summary-container">
          <Card>
            <Text className="heading">{getFormName()}</Text>
            <Divider />
            <div className="response-count-container">
              <Text className="response-count">
                {responses === undefined ? "Searching..." : getResponderCount()}{" "}
              </Text>
              <Text className="response-count-label">responder(s)</Text>
            </div>
          </Card>
        </div>
      </SummaryStyle>
      <ResponseWrapper>
        <Export responsesData={getData(true) || []} formName={getFormName()} />
        <div style={{ overflow: "scroll", marginBottom: 60 }}>
          <Table
            columns={getColumns()}
            dataSource={getData(true)}
            pagination={{ pageSize: 10 }} 
            loading={{
              spinning: responses === undefined,
              tip: "🔎 Looking for responses...",
            }}
            scroll={{ x: isMobile() ? 900 : 1500, y: "calc(65% - 400px)" }}
            onRow={(record) => {
              return {
                onClick: (event) => {
                  event.stopPropagation();
                  
                  if (formSpec && formSpec.length > 0) {
                    handleRowClick(record);
                  } else {
                    console.warn("Form specification not ready, cannot open details modal.");
                    
                  }
                },
                style: { cursor: 'pointer' }
              };
            }}
          />
        </div>
      </ResponseWrapper>
      {isModalOpen && formSpec && formSpec.length > 0 && (
        <ResponseDetailModal
          isVisible={isModalOpen}
          onClose={() => {
              setIsModalOpen(false);
              setSelectedEventForModal(null);
          }}
          responseEvent={selectedEventForModal}
          formSpec={formSpec} 
          editKey={editKey}
        />
      )}
    </div>
  );
};
